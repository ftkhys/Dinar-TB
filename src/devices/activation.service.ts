import {
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { AuditLogService } from '../common/audit-log.service';
import { ActivationCode } from '../database/entities/activation-code.entity';
import { Patient } from '../database/entities/patient.entity';
import { PatientDevice } from '../database/entities/patient-device.entity';
import { AuthService } from '../auth/auth.service';

export const ACTIVATION_CODE_VALIDITY_MS = 24 * 60 * 60 * 1000;

/**
 * Crockford-style alphabet: excludes the easily confused characters I, L, O,
 * 0 and 1 so the code can be read aloud or copied without ambiguity.
 * 31^8 ≈ 8.5×10^11 combinations (~39.6 bits) for an 8-character code.
 */
export const ACTIVATION_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ACTIVATION_CODE_LENGTH = 8;
const ACTIVATION_CODE_GROUP = 4;

/** In-memory attempt limit per client key (see `ActivationAttemptLimiter`). */
export const ACTIVATION_RATE_LIMIT = { maxAttempts: 20, windowMs: 5 * 60 * 1000 };

/**
 * Generates a human-friendly one-time activation code grouped for reading,
 * e.g. `K7QP-3RMN`. Only the normalized form (uppercase, no separators) is
 * stored, as a SHA-256 hash, so the plaintext code is never persisted.
 */
export function generateActivationCode(): string {
  const chars: string[] = [];
  for (let index = 0; index < ACTIVATION_CODE_LENGTH; index += 1) {
    chars.push(ACTIVATION_CODE_ALPHABET[randomInt(ACTIVATION_CODE_ALPHABET.length)]);
  }
  const grouped: string[] = [];
  for (let index = 0; index < chars.length; index += ACTIVATION_CODE_GROUP) {
    grouped.push(chars.slice(index, index + ACTIVATION_CODE_GROUP).join(''));
  }
  return grouped.join('-');
}

/** Uppercases and strips separators so `k7qp 3rmn` and `K7QP-3RMN` match. */
export function normalizeActivationCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Bounds repeated activation attempts from one client (e.g. one IP) in a
 * sliding window. In-memory and single-instance only; documented as a
 * hardening measure, not a substitute for edge rate limiting.
 */
export class ActivationAttemptLimiter {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly maxAttempts = ACTIVATION_RATE_LIMIT.maxAttempts,
    private readonly windowMs = ACTIVATION_RATE_LIMIT.windowMs,
  ) {}

  private recent(key: string, now: number): number[] {
    return (this.attempts.get(key) ?? []).filter((at) => now - at < this.windowMs);
  }

  isBlocked(key: string, now = Date.now()): boolean {
    const hits = this.recent(key, now);
    if (hits.length) this.attempts.set(key, hits);
    else this.attempts.delete(key);
    return hits.length >= this.maxAttempts;
  }

  record(key: string, now = Date.now()): void {
    const hits = this.recent(key, now);
    hits.push(now);
    this.attempts.set(key, hits);
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}

@Injectable()
export class ActivationService {
  constructor(
    @InjectRepository(ActivationCode) private readonly codes: Repository<ActivationCode>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(PatientDevice) private readonly devices: Repository<PatientDevice>,
    private readonly dataSource: DataSource,
    private readonly auth: AuthService,
    private readonly audit: AuditLogService,
  ) {}

  private readonly limiter = new ActivationAttemptLimiter();

  async issueCode(patientId: string, staffId: string): Promise<{ activationCode: string; expiresAt: string }> {
    const patient = await this.patients.findOneBy({ id: patientId });
    if (!patient || patient.archivedAt) throw new NotFoundException('Pasien tidak ditemukan.');
    const code = generateActivationCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ACTIVATION_CODE_VALIDITY_MS);
    await this.dataSource.transaction(async (manager) => {
      // Issuing a new code invalidates the patient's earlier unused codes so an
      // officer and patient cannot be confused by several live codes.
      await manager.getRepository(ActivationCode).createQueryBuilder()
        .update(ActivationCode)
        .set({ usedAt: now })
        .where('patient_id = :patientId AND used_at IS NULL', { patientId })
        .execute();
      const repo = manager.getRepository(ActivationCode);
      await repo.save(repo.create({
        patientId,
        codeHash: hashActivationCode(code),
        expiresAt,
        usedAt: null,
        issuedByStaffId: staffId,
      }));
    });
    await this.audit.record({ actorStaffId: staffId, objectType: 'activation_code', objectId: patientId, action: 'issued', details: expiresAt.toISOString() });
    return { activationCode: code, expiresAt: expiresAt.toISOString() };
  }

  async activate(
    code: string,
    deviceIdentifier: string,
    clientKey = 'local',
  ): Promise<{ deviceId: string; deviceCredential: string; accessToken: string }> {
    if (this.limiter.isBlocked(clientKey)) {
      throw new HttpException('Terlalu banyak percobaan aktivasi. Silakan coba lagi nanti.', 429);
    }
    const codeHash = hashActivationCode(code);
    const now = new Date();
    const deviceCredential = randomBytes(32).toString('base64url');
    let result: { device: PatientDevice; patientId: string };
    try {
      result = await this.dataSource.transaction(async (manager) => {
        const codeRow = await manager.getRepository(ActivationCode).createQueryBuilder('code')
          .addSelect('code.codeHash')
          .setLock('pessimistic_write')
          .where('code.codeHash = :codeHash', { codeHash })
          .getOne();
        if (!codeRow || codeRow.usedAt || codeRow.expiresAt <= now) {
          throw new UnauthorizedException('Kode aktivasi tidak berlaku atau sudah digunakan.');
        }
        const patient = await manager.getRepository(Patient).createQueryBuilder('patient')
          .setLock('pessimistic_write')
          .where('patient.id = :id', { id: codeRow.patientId })
          .getOne();
        if (!patient || patient.archivedAt) throw new NotFoundException('Pasien tidak ditemukan.');
        const deviceRepo = manager.getRepository(PatientDevice);
        let sameDevice = await deviceRepo.findOneBy({ deviceIdentifier });
        if (sameDevice && sameDevice.patientId !== patient.id) {
          throw new ConflictException('Device ini sudah terhubung ke pasien lain.');
        }
        await deviceRepo.createQueryBuilder()
          .update(PatientDevice)
          .set({ deactivatedAt: now })
          .where('patient_id = :patientId AND deactivated_at IS NULL', { patientId: patient.id })
          .execute();
        if (sameDevice) {
          // Bump the version on credential rotation so any access token issued
          // before re-activation is rejected by DeviceAuthGuard immediately.
          await deviceRepo.createQueryBuilder()
            .update(PatientDevice)
            .set({ credentialHash: hash(deviceCredential), activatedAt: now, deactivatedAt: null, version: () => 'version + 1' })
            .where('id = :id', { id: sameDevice.id })
            .execute();
          sameDevice = await deviceRepo.findOneByOrFail({ id: sameDevice.id });
        } else {
          sameDevice = await deviceRepo.save(deviceRepo.create({
            patientId: patient.id,
            deviceIdentifier,
            credentialHash: hash(deviceCredential),
            activatedAt: now,
            deactivatedAt: null,
          }));
        }
        codeRow.usedAt = now;
        await manager.save(codeRow);
        return { device: sameDevice, patientId: patient.id };
      });
    } catch (error) {
      this.limiter.record(clientKey);
      throw error;
    }
    this.limiter.reset(clientKey);
    await this.audit.record({ actorStaffId: null, objectType: 'patient_device', objectId: result.device.id, action: 'activated' });
    return {
      deviceId: result.device.id,
      deviceCredential,
      accessToken: this.auth.sign({ sub: result.device.id, kind: 'patient_device', patientId: result.patientId, version: result.device.version }, 30 * 24 * 60 * 60),
    };
  }

  async refresh(deviceId: string, credential: string): Promise<{ accessToken: string }> {
    const device = await this.devices.createQueryBuilder('device')
      .addSelect('device.credentialHash')
      .where('device.id = :deviceId', { deviceId })
      .andWhere('device.deactivatedAt IS NULL')
      .getOne();
    if (!device || !safeHashEqual(device.credentialHash, hash(credential))) {
      throw new UnauthorizedException('Kredensial device tidak berlaku.');
    }
    return {
      accessToken: this.auth.sign({ sub: device.id, kind: 'patient_device', patientId: device.patientId, version: device.version }, 30 * 24 * 60 * 60),
    };
  }
}

export function hashActivationCode(value: string): string {
  return hash(normalizeActivationCode(value));
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeHashEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
