import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Patient } from './patient.entity';
import { PatientWebSession } from './patient-web-session.entity';

/**
 * A standards-based Web Push subscription (Chrome/Edge/Android and installed
 * iOS Safari 16.4+). It belongs to the browser session, so revoking/logging out
 * that session also removes its subscription.
 */
@Entity('web_push_subscriptions')
@Index('UQ_web_push_subscriptions_endpoint', ['endpoint'], { unique: true })
@Index('IDX_web_push_subscriptions_patient', ['patientId'])
export class WebPushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @ManyToOne(() => PatientWebSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session!: PatientWebSession;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId!: string;

  @ManyToOne(() => Patient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient!: Patient;

  @Column({ type: 'varchar', length: 2048 })
  endpoint!: string;

  @Column({ name: 'p256dh', type: 'varchar', length: 255 })
  p256dh!: string;

  @Column({ name: 'auth', type: 'varchar', length: 255 })
  auth!: string;

  @Column({ name: 'expiration_time', type: 'bigint', nullable: true })
  expirationTime!: string | null;

  @Column({ name: 'failure_count', type: 'int', default: 0 })
  failureCount!: number;

  @Column({ name: 'last_success_at', type: 'timestamptz', nullable: true })
  lastSuccessAt!: Date | null;

  @Column({ name: 'disabled_at', type: 'timestamptz', nullable: true })
  disabledAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
