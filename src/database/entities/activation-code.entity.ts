import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Patient } from './patient.entity';
import { StaffAccount } from './staff-account.entity';

@Entity('activation_codes')
@Index('IDX_activation_codes_patient_expiry', ['patientId', 'expiresAt'])
export class ActivationCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId!: string;

  @ManyToOne(() => Patient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient!: Patient;

  @Column({ name: 'code_hash', type: 'varchar', length: 64, unique: true, select: false })
  codeHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @Column({ name: 'issued_by_staff_id', type: 'uuid' })
  issuedByStaffId!: string;

  @ManyToOne(() => StaffAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'issued_by_staff_id' })
  issuedBy!: StaffAccount;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
