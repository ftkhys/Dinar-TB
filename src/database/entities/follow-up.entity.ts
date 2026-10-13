import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FollowUpOutcome } from '../enums';
import { ControlSchedule } from './control-schedule.entity';
import { StaffAccount } from './staff-account.entity';

@Entity('follow_ups')
export class FollowUp {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'control_schedule_id', type: 'uuid' })
  controlScheduleId!: string;

  @ManyToOne(() => ControlSchedule, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'control_schedule_id' })
  controlSchedule!: ControlSchedule;

  @Column({ type: 'enum', enum: FollowUpOutcome, enumName: 'follow_up_outcome' })
  outcome!: FollowUpOutcome;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ name: 'recorded_by_staff_id', type: 'uuid' })
  recordedByStaffId!: string;

  @ManyToOne(() => StaffAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'recorded_by_staff_id' })
  recordedBy!: StaffAccount;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
