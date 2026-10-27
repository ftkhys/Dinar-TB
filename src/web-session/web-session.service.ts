import {
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import type { CookieOptions } from 'express';
import { AuditLogService } from '../common/audit-log.service';
import {
  ActivationAttemptLimiter,
  hashActivationCode,
} from '../devices/activation.service';
import { ActivationCode } from '../database/entities/activation-code.entity';
import { Patient } from '../database/entities/patient.entity';
import { PatientWebSession } from '../database/entities/patient-web-session.entity';
import { WebPushSubscription } from '../database/entities/web-push-subscription.entity';

export const WEB_SESSION_COOKIE = 'dinar_web_session';

function clampDays(value: number): number {
  if (!Number.isFinite(value)) return 7;
  return Math.max(1, Math.min(30, Math.floor(value)));
}

export function webSessionTtlDays(): number {
  return clampDays(Number(process.env.WEB_SESSION_TTL_DAYS ?? 7));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function privacyHash(value: string | undefined): string | null {
  if (!value) return null;
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) return null;
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function webSessionCookieOptions(expiresAt?: Date): CookieOptions {
  const secure =
    process.env.WEB_COOKIE_SECURE === 'true' ||
    process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}

export function readCookie(
  cookieHeader: string | undefined,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export type WebSessionView = {
  sessionId: string;
  patientId: string;
  patient: { id: string; fullName: string; registerNumber: string };
  expiresAt: string;
};

@Injectable()
export class WebSessionService {
  private readonly limiter = new ActivationAttemptLimiter();

  constructor(
    @InjectRepository(PatientWebSession)
    private readonly sessions: Repository<PatientWebSession>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Redeems an activation code for a browser-only session. Unlike the Android
   * activation path this deliberately never writes to `patient_devices`, so an
   * already-active phone is not deactivated or rotated.
   */
  async activate(
    code: string,
    clientKey: string,
    meta: { userAgent?: string; ip?: string },
  ): Promise<{ token: string; session: WebSessionView }> {
    if (this.limiter.isBlocked(clientKey)) {
      throw new HttpException(
        'Terlalu banyak percobaan aktivasi. Silakan coba lagi nanti.',
        429,
      );
    }

    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + webSessionTtlDays() * 24 * 60 * 60 * 1000,
    );
    const codeHash = hashActivationCode(code);

    let result: { session: PatientWebSession; patient: Patient };
    try {
      result = await this.dataSource.transaction(async (manager) => {
        const codeRow = await manager
          .getRepository(ActivationCode)
          .createQueryBuilder('code')
          .addSelect('code.codeHash')
          .setLock('pessimistic_write')
          .where('code.codeHash = :codeHash', { codeHash })
          .getOne();
        if (!codeRow || codeRow.usedAt || codeRow.expiresAt <= now) {
          throw new UnauthorizedException(
            'Kode aktivasi tidak berlaku atau sudah digunakan.',
          );
        }

        const patient = await manager
          .getRepository(Patient)
          .createQueryBuilder('patient')
          .setLock('pessimistic_write')
          .where('patient.id = :id', { id: codeRow.patientId })
          .getOne();
        if (!patient || patient.archivedAt || patient.anonymizedAt) {
          throw new NotFoundException('Pasien tidak ditemukan.');
        }

        const sessionRepo = manager.getRepository(PatientWebSession);
        const session = await sessionRepo.save(
          sessionRepo.create({
            patientId: patient.id,
            tokenHash: sha256(token),
            activationCodeId: codeRow.id,
            expiresAt,
            lastSeenAt: now,
            revokedAt: null,
            userAgentHash: privacyHash(meta.userAgent),
            ipHash: privacyHash(meta.ip),
          }),
        );

        codeRow.usedAt = now;
        await manager.save(codeRow);
        return { session, patient };
      });
    } catch (error) {
      this.limiter.record(clientKey);
      throw error;
    }

    this.limiter.reset(clientKey);
    await this.audit.record({
      actorStaffId: null,
      objectType: 'patient_web_session',
      objectId: result.session.id,
      action: 'activated',
      details: `patient:${result.patient.id}`,
    });

    return {
      token,
      session: {
        sessionId: result.session.id,
        patientId: result.patient.id,
        patient: {
          id: result.patient.id,
          fullName: result.patient.fullName,
          registerNumber: result.patient.registerNumber,
        },
        expiresAt: result.session.expiresAt.toISOString(),
      },
    };
  }

  async resolve(token: string): Promise<WebSessionView> {
    const now = new Date();
    const session = await this.sessions
      .createQueryBuilder('session')
      .addSelect('session.tokenHash')
      .innerJoinAndSelect('session.patient', 'patient')
      .where('session.tokenHash = :tokenHash', { tokenHash: sha256(token) })
      .andWhere('session.revokedAt IS NULL')
      .andWhere('session.expiresAt > :now', { now })
      .andWhere('patient.archivedAt IS NULL')
      .andWhere('patient.anonymizedAt IS NULL')
      .getOne();

    if (!session) {
      throw new UnauthorizedException(
        'Sesi web tidak berlaku atau sudah kedaluwarsa. Masukkan kode aktivasi baru.',
      );
    }

    // Keep a coarse last-seen timestamp without writing on every API call.
    if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
      await this.sessions.update({ id: session.id }, { lastSeenAt: now });
    }

    return {
      sessionId: session.id,
      patientId: session.patientId,
      patient: {
        id: session.patient.id,
        fullName: session.patient.fullName,
        registerNumber: session.patient.registerNumber,
      },
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(WebPushSubscription).delete({ sessionId });
      await manager
        .getRepository(PatientWebSession)
        .update(
          { id: sessionId, revokedAt: IsNull() },
          { revokedAt: new Date() },
        );
    });
    await this.audit.record({
      actorStaffId: null,
      objectType: 'patient_web_session',
      objectId: sessionId,
      action: 'logged_out',
    });
  }

  /** Removes long-expired sessions; subscriptions cascade with them. */
  async purgeExpired(olderThanDays = 30): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await this.sessions
      .createQueryBuilder()
      .delete()
      .where('expires_at < :cutoff', { cutoff })
      .execute();
    return result.affected ?? 0;
  }
}
