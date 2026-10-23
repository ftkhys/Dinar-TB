import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogService } from '../common/audit-log.service';
import { optionalPhone, requiredString } from '../common/input';
import { AppSetting } from '../database/entities/app-setting.entity';

export type AppSettingsView = {
  puskesmasName: string;
  puskesmasPhone: string | null;
  controlIntervalDays: number;
  reminderMorning: string;
  reminderEvening: string;
  updatedAt: string;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MIN_INTERVAL_DAYS = 1;
const MAX_INTERVAL_DAYS = 365;

const SETTINGS_ROW_ID = 1;
/**
 * `audit_logs.object_id` is a uuid, but `app_settings` is a single
 * smallint-keyed row. A fixed synthetic uuid keeps audit entries valid and
 * lets the activity feed reference the shared settings row consistently.
 */
const SETTINGS_AUDIT_OBJECT_ID = '00000000-0000-0000-0000-000000000001';

function normalizeTime(value: unknown, name: string): string {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value.trim())) {
    throw new BadRequestException(`${name} harus berformat HH:MM (24 jam).`);
  }
  return value.trim();
}

function normalizeInterval(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < MIN_INTERVAL_DAYS || parsed > MAX_INTERVAL_DAYS) {
    throw new BadRequestException(
      `Interval kontrol standar harus bilangan bulat antara ${MIN_INTERVAL_DAYS} dan ${MAX_INTERVAL_DAYS} hari.`,
    );
  }
  return parsed;
}

function addOneHour(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const next = (hours + 1) % 24;
  return `${String(next).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSetting) private readonly settings: Repository<AppSetting>,
    private readonly audit: AuditLogService,
  ) {}

  private async ensureRow(): Promise<AppSetting> {
    const existing = await this.settings.findOne({ where: { id: SETTINGS_ROW_ID } });
    if (existing) return existing;
    try {
      return await this.settings.save(
        this.settings.create({
          id: SETTINGS_ROW_ID,
          puskesmasName: process.env.PUSKESMAS_NAME ?? 'Puskesmas Jatinegara',
        }),
      );
    } catch {
      // A concurrent request may have inserted the row; re-read it.
      const row = await this.settings.findOne({ where: { id: SETTINGS_ROW_ID } });
      if (row) return row;
      throw new InternalServerErrorException('Pengaturan aplikasi tidak tersedia.');
    }
  }

  private toView(row: AppSetting): AppSettingsView {
    return {
      puskesmasName: row.puskesmasName,
      puskesmasPhone: row.puskesmasPhone,
      controlIntervalDays: row.controlIntervalDays,
      reminderMorning: row.reminderMorning,
      reminderEvening: row.reminderEvening,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    };
  }

  async get(): Promise<AppSettingsView> {
    return this.toView(await this.ensureRow());
  }

  /**
   * Clinic identity consumed by the patient sync payload so the device can show
   * the real facility name/phone instead of a hardcoded location.
   */
  async clinicInfo(): Promise<{ name: string; phone: string | null }> {
    const row = await this.ensureRow();
    return { name: row.puskesmasName, phone: row.puskesmasPhone };
  }

  /** Standard control interval in days consumed by the visit scheduling rule. */
  async controlIntervalDays(): Promise<number> {
    return (await this.ensureRow()).controlIntervalDays;
  }

  /**
   * Reminder windows consumed by the patient app during sync. The app schedules
   * a notification at the window `start`; the window keeps the previous one-hour
   * span (`start`–`start`+1h) so the persisted times preserve the existing
   * morning/evening semantics.
   */
  async reminderWindows(): Promise<Array<{ start: string; end: string }>> {
    const row = await this.ensureRow();
    return [
      { start: row.reminderMorning, end: addOneHour(row.reminderMorning) },
      { start: row.reminderEvening, end: addOneHour(row.reminderEvening) },
    ];
  }

  async update(actorStaffId: string | null, body: Record<string, unknown>): Promise<AppSettingsView> {
    const row = await this.ensureRow();
    const groups = new Set<string>();

    if (body.puskesmasName !== undefined) {
      row.puskesmasName = requiredString(body.puskesmasName, 'Nama Puskesmas', 160);
      groups.add('puskesmas_updated');
    }
    if (body.puskesmasPhone !== undefined) {
      row.puskesmasPhone = optionalPhone(body.puskesmasPhone, 'Nomor telepon Puskesmas');
      groups.add('puskesmas_updated');
    }
    if (body.controlIntervalDays !== undefined) {
      row.controlIntervalDays = normalizeInterval(body.controlIntervalDays);
      groups.add('schedule_updated');
    }
    if (body.reminderMorning !== undefined) {
      row.reminderMorning = normalizeTime(body.reminderMorning, 'Waktu pengingat utama');
      groups.add('reminder_updated');
    }
    if (body.reminderEvening !== undefined) {
      row.reminderEvening = normalizeTime(body.reminderEvening, 'Waktu pengingat malam');
      groups.add('reminder_updated');
    }

    return this.settings.manager.transaction(async (manager) => {
      const saved = await manager.getRepository(AppSetting).save(row);

      for (const action of groups) {
        await this.audit.record(
          {
            actorStaffId,
            objectType: 'app_settings',
            objectId: SETTINGS_AUDIT_OBJECT_ID,
            action,
          },
          manager,
        );
      }

      return this.toView(saved);
    });
  }
}
