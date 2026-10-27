import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ActivationCode } from './activation-code.entity';
import { Patient } from './patient.entity';

/**
 * A browser session created by redeeming a one-time activation code.
 *
 * This is intentionally separate from `patient_devices`: redeeming a code on
 * the web must never deactivate the patient's already-active Android device.
 * Only a SHA-256 hash of the random session token is persisted.
 */
@Entity('patient_web_sessions')
@Index('IDX_patient_web_sessions_patient', ['patientId'])
@Index('UQ_patient_web_sessions_token_hash', ['tokenHash'], { unique: true })
export class PatientWebSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId!: string;

  @ManyToOne(() => Patient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient!: Patient;

  @Column({ name: 'token_hash', type: 'varchar', length: 64, select: false })
  tokenHash!: string;

  @Column({ name: 'activation_code_id', type: 'uuid', nullable: true })
  activationCodeId!: string | null;

  @ManyToOne(() => ActivationCode, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'activation_code_id' })
  activationCode!: ActivationCode | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({
    name: 'user_agent_hash',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  userAgentHash!: string | null;

  @Column({ name: 'ip_hash', type: 'varchar', length: 64, nullable: true })
  ipHash!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
