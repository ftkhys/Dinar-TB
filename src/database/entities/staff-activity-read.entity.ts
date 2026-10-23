import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Last time a staff account opened the activity/notification panel. Used to
 * compute the unread badge without mutating the immutable `audit_logs` history.
 */
@Entity('staff_activity_reads')
export class StaffActivityRead {
  @PrimaryColumn({ name: 'staff_id', type: 'uuid' })
  staffId!: string;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
