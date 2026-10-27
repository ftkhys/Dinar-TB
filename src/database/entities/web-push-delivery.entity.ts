import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Patient } from './patient.entity';

/** One dose-reminder push per patient, local date and morning/evening slot. */
@Entity('web_push_deliveries')
@Unique('UQ_web_push_deliveries_patient_date_slot', [
  'patientId',
  'localDate',
  'slot',
])
@Index('IDX_web_push_deliveries_patient_date', ['patientId', 'localDate'])
export class WebPushDelivery {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId!: string;

  @ManyToOne(() => Patient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient!: Patient;

  @Column({ name: 'local_date', type: 'date' })
  localDate!: string;

  @Column({ type: 'varchar', length: 16 })
  slot!: string;

  @CreateDateColumn({ name: 'sent_at', type: 'timestamptz' })
  sentAt!: Date;
}
