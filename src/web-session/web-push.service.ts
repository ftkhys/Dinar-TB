import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import * as webpush from 'web-push';
import { localTodayJakarta } from '../common/date-rules';
import { SettingsService } from '../settings/settings.service';
import { WebPushDelivery } from '../database/entities/web-push-delivery.entity';
import { WebPushSubscription } from '../database/entities/web-push-subscription.entity';

const REMINDER_GRACE_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const ALLOWED_PUSH_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'updates.push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
  'push.microsoft.com',
];

type SubscriptionInput = {
  endpoint?: unknown;
  expirationTime?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

type PushTarget = {
  id: string;
  patientId: string;
  patientName: string;
  treatmentCourseId?: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private configured = false;

  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly dataSource: DataSource,
    @InjectRepository(WebPushSubscription)
    private readonly subscriptions: Repository<WebPushSubscription>,
    @InjectRepository(WebPushDelivery)
    private readonly deliveries: Repository<WebPushDelivery>,
  ) {
    const publicKey = this.config.get<string>('WEB_PUSH_PUBLIC_KEY');
    const privateKey = this.config.get<string>('WEB_PUSH_PRIVATE_KEY');
    const subject = this.config.get<string>('WEB_PUSH_SUBJECT');
    if (publicKey && privateKey && subject) {
      try {
        webpush.setVapidDetails(subject, publicKey, privateKey);
        this.configured = true;
      } catch (error) {
        this.logger.error(
          `Konfigurasi VAPID Web Push tidak valid: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else {
      this.logger.warn(
        'Web Push dinonaktifkan: WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, dan WEB_PUSH_SUBJECT belum diatur.',
      );
    }
  }

  publicConfig(): { enabled: boolean; publicKey: string | null } {
    return {
      enabled: this.configured,
      publicKey: this.configured
        ? (this.config.get<string>('WEB_PUSH_PUBLIC_KEY') ?? null)
        : null,
    };
  }

  async subscribe(
    patientId: string,
    sessionId: string,
    input: SubscriptionInput,
  ): Promise<{ id: string }> {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Web Push belum dikonfigurasi pada server.',
      );
    }
    const endpoint =
      typeof input.endpoint === 'string' ? input.endpoint.trim() : '';
    const p256dh =
      typeof input.keys?.p256dh === 'string' ? input.keys.p256dh.trim() : '';
    const auth =
      typeof input.keys?.auth === 'string' ? input.keys.auth.trim() : '';
    if (!isAllowedPushEndpoint(endpoint)) {
      throw new BadRequestException('Endpoint push tidak valid.');
    }
    if (!p256dh || p256dh.length > 255 || !auth || auth.length > 255) {
      throw new BadRequestException('Kunci push tidak valid.');
    }
    let expirationTime: string | null = null;
    if (input.expirationTime !== null && input.expirationTime !== undefined) {
      const numeric = Number(input.expirationTime);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        throw new BadRequestException('Waktu kedaluwarsa push tidak valid.');
      }
      expirationTime = String(Math.floor(numeric));
    }

    let row = await this.subscriptions.findOneBy({ endpoint });
    if (!row) {
      row = this.subscriptions.create({ endpoint });
    }
    row.sessionId = sessionId;
    row.patientId = patientId;
    row.p256dh = p256dh;
    row.auth = auth;
    row.expirationTime = expirationTime;
    row.failureCount = 0;
    row.disabledAt = null;
    const saved = await this.subscriptions.save(row);
    return { id: saved.id };
  }

  async unsubscribe(
    sessionId: string,
    endpoint?: string,
  ): Promise<{ removed: number }> {
    const where: { sessionId: string; endpoint?: string } = { sessionId };
    if (endpoint) where.endpoint = endpoint;
    const result = await this.subscriptions.delete(where);
    return { removed: result.affected ?? 0 };
  }

  async subscriptionCount(sessionId: string): Promise<number> {
    return this.subscriptions.countBy({ sessionId, disabledAt: IsNull() });
  }

  async sendTestToSession(
    patientId: string,
    sessionId: string,
  ): Promise<{ sent: number; total: number }> {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Web Push belum dikonfigurasi pada server.',
      );
    }
    const rows = await this.subscriptions.findBy({
      patientId,
      sessionId,
      disabledAt: IsNull(),
    });
    if (rows.length === 0) {
      throw new BadRequestException(
        'Belum ada langganan notifikasi aktif pada browser ini.',
      );
    }
    const payload = {
      title: 'Notifikasi Dinar-TB aktif',
      body: 'Pengingat obat akan dikirim sesuai jadwal dari petugas.',
      icon: '/portal-icons/icon-192.png',
      badge: '/portal-icons/icon-192.png',
      tag: 'dinar-tb-test',
      data: { type: 'test', url: '/pasien.html?app=1' },
    };
    let sent = 0;
    for (const row of rows) {
      const ok = await this.send(
        {
          id: row.id,
          patientId: row.patientId,
          patientName: '',
          endpoint: row.endpoint,
          p256dh: row.p256dh,
          auth: row.auth,
        },
        payload,
      );
      if (ok) sent += 1;
    }
    return { sent, total: rows.length };
  }

  /**
   * Sends each due dose reminder at most once per patient/date/slot. The
   * delivery row is claimed before sending and released if every push fails.
   */
  async sendDueReminders(
    now = new Date(),
  ): Promise<{ sent: number; failed: number }> {
    if (!this.configured) return { sent: 0, failed: 0 };

    const windows = await this.settings.reminderWindows();
    const today = localTodayJakarta(now);
    const yesterday = localTodayJakarta(
      new Date(now.getTime() - 24 * 60 * 60 * 1000),
    );
    const slots = [
      { key: 'morning', label: 'pagi', start: windows[0]?.start },
      { key: 'evening', label: 'malam', start: windows[1]?.start },
    ];

    const due = slots.filter(
      (slot) => slot.start && isDueInJakarta(now, slot.start, today, yesterday),
    );
    if (due.length === 0) return { sent: 0, failed: 0 };

    const targets = (await this.dataSource.query(
      `SELECT s.id, s.patient_id AS "patientId", p.full_name AS "patientName",
              tc.id AS "treatmentCourseId", s.endpoint, s.p256dh, s.auth
         FROM web_push_subscriptions s
         JOIN patient_web_sessions ws ON ws.id = s.session_id
         JOIN patients p ON p.id = s.patient_id
         JOIN treatment_courses tc ON tc.patient_id = p.id
        WHERE s.disabled_at IS NULL
          AND ws.revoked_at IS NULL
          AND ws.expires_at > now()
          AND p.archived_at IS NULL
          AND p.anonymized_at IS NULL
          AND tc.completed_at IS NULL
          AND tc.start_date <= $1::date
        GROUP BY s.id, s.patient_id, p.full_name, tc.id, s.endpoint, s.p256dh, s.auth`,
      [today],
    )) as PushTarget[];

    const confirmedRows = (await this.dataSource.query(
      `SELECT da.treatment_course_id AS "treatmentCourseId",
              to_char(da.adherence_date, 'YYYY-MM-DD') AS "date"
         FROM daily_adherence da
        WHERE da.adherence_date IN ($1::date, $2::date)`,
      [today, yesterday],
    )) as Array<{ treatmentCourseId: string; date: string }>;
    const confirmed = new Set(
      confirmedRows.map((row) => `${row.treatmentCourseId}:${row.date}`),
    );

    let sent = 0;
    let failed = 0;
    for (const slot of due) {
      const byPatient = new Map<string, PushTarget[]>();
      for (const target of targets) {
        const list = byPatient.get(target.patientId) ?? [];
        list.push(target);
        byPatient.set(target.patientId, list);
      }

      for (const [patientId, patientTargets] of byPatient) {
        const date = dueDateForSlot(now, slot.start!, today, yesterday);
        const courseIds = new Set(
          patientTargets
            .map((target) => target.treatmentCourseId)
            .filter((courseId): courseId is string => Boolean(courseId)),
        );
        if (
          courseIds.size > 0 &&
          [...courseIds].every((courseId) =>
            confirmed.has(`${courseId}:${date}`),
          )
        ) {
          continue;
        }
        if (!(await this.claimDelivery(patientId, date, slot.key))) continue;
        const payload = {
          title: 'Waktunya minum obat',
          body: `Jadwal minum obat ${slot.label} sudah tiba. Buka Dinar-TB untuk mengonfirmasi.`,
          icon: '/portal-icons/icon-192.png',
          badge: '/portal-icons/icon-192.png',
          tag: `dose-${date}-${slot.key}`,
          data: {
            type: 'dose_reminder',
            date,
            slot: slot.key,
            url: '/pasien.html?app=1',
          },
        };
        let succeeded = false;
        for (const target of patientTargets) {
          const ok = await this.send(target, payload);
          if (ok) succeeded = true;
        }
        if (succeeded) {
          sent += 1;
        } else {
          failed += 1;
          await this.deliveries.delete({
            patientId,
            localDate: date,
            slot: slot.key,
          });
        }
      }
    }
    return { sent, failed };
  }

  private async claimDelivery(
    patientId: string,
    localDate: string,
    slot: string,
  ): Promise<boolean> {
    const result = await this.dataSource.query(
      `INSERT INTO web_push_deliveries(patient_id, local_date, slot)
       VALUES ($1, $2, $3)
       ON CONFLICT (patient_id, local_date, slot) DO NOTHING
       RETURNING id`,
      [patientId, localDate, slot],
    );
    return Array.isArray(result) && result.length > 0;
  }

  private async send(target: PushTarget, payload: unknown): Promise<boolean> {
    try {
      await webpush.sendNotification(
        {
          endpoint: target.endpoint,
          keys: { p256dh: target.p256dh, auth: target.auth },
        },
        JSON.stringify(payload),
        { TTL: 60 * 60, urgency: 'high' },
      );
      await this.subscriptions.update(
        { id: target.id },
        { lastSuccessAt: new Date(), failureCount: 0 },
      );
      return true;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await this.subscriptions.delete({ id: target.id });
        this.logger.log(`Langganan push kedaluwarsa dihapus (${statusCode}).`);
      } else {
        await this.subscriptions.increment(
          { id: target.id },
          'failureCount',
          1,
        );
        const current = await this.subscriptions.findOneBy({ id: target.id });
        if (current && current.failureCount >= MAX_FAILURES) {
          await this.subscriptions.update(
            { id: target.id },
            { disabledAt: new Date() },
          );
        }
        this.logger.warn(
          `Push gagal untuk langganan ${target.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return false;
    }
  }
}

function isAllowedPushEndpoint(value: string): boolean {
  if (!value || value.length > 2048) return false;
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    return false;
  }
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password
  ) {
    return false;
  }
  if (endpoint.port && endpoint.port !== '443') return false;
  const host = endpoint.hostname.toLowerCase();
  return ALLOWED_PUSH_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

function jakartaDateTime(date: string, time: string): number {
  return new Date(`${date}T${time}:00+07:00`).getTime();
}

function isDueInJakarta(
  now: Date,
  start: string,
  today: string,
  yesterday: string,
): boolean {
  return [today, yesterday].some((date) => {
    const scheduled = jakartaDateTime(date, start);
    return (
      now.getTime() >= scheduled &&
      now.getTime() < scheduled + REMINDER_GRACE_MS
    );
  });
}

function dueDateForSlot(
  now: Date,
  start: string,
  today: string,
  yesterday: string,
): string {
  return jakartaDateTime(today, start) <= now.getTime() ? today : yesterday;
}
