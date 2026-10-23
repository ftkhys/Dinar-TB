import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Single-row table (`id = 1`) with values shared by every staff account. Kept
 * tiny on purpose: the clinic identity, the default control interval and the
 * reminder times the patient app reads during sync.
 */
@Entity('app_settings')
export class AppSetting {
  @PrimaryColumn({ type: 'smallint', default: 1 })
  id!: number;

  @Column({ name: 'puskesmas_name', type: 'varchar', length: 160 })
  puskesmasName!: string;

  @Column({ name: 'puskesmas_phone', type: 'varchar', length: 32, nullable: true })
  puskesmasPhone!: string | null;

  @Column({ name: 'control_interval_days', type: 'int', default: 14 })
  controlIntervalDays!: number;

  @Column({ name: 'reminder_morning', type: 'varchar', length: 5, default: '06:00' })
  reminderMorning!: string;

  @Column({ name: 'reminder_evening', type: 'varchar', length: 5, default: '20:00' })
  reminderEvening!: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
