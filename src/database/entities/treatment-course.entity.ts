import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { TreatmentDecision } from '../enums';
import { Patient } from './patient.entity';

@Entity('treatment_courses')
@Index('IDX_treatment_courses_patient', ['patientId'])
@Unique('UQ_treatment_courses_id_patient', ['id', 'patientId'])
export class TreatmentCourse {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId!: string;

  @ManyToOne(() => Patient, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'patient_id' })
  patient!: Patient;

  @Column({ name: 'treatment_stage', type: 'varchar', length: 120, nullable: true })
  treatmentStage!: string | null;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'initial_target_end_date', type: 'date' })
  initialTargetEndDate!: string;

  /**
   * Real date of the most recent control visit, distinct from `startDate`.
   * Nullable: unknown history is allowed and must not be treated as "late".
   */
  @Column({ name: 'last_control_date', type: 'date', nullable: true })
  lastControlDate!: string | null;

  /**
   * Real date medicine was last dispensed. Only this date — never `startDate`
   * or `lastControlDate` — is used to derive the next control schedule.
   */
  @Column({ name: 'last_medication_date', type: 'date', nullable: true })
  lastMedicationDate!: string | null;

  @Column({ name: 'final_decision', type: 'enum', enum: TreatmentDecision, enumName: 'treatment_decision', nullable: true })
  finalDecision!: TreatmentDecision | null;

  @Column({ name: 'final_review_note', type: 'text', nullable: true })
  finalReviewNote!: string | null;

  @Column({ name: 'final_reviewed_at', type: 'timestamptz', nullable: true })
  finalReviewedAt!: Date | null;

  @Column({ name: 'continued_target_end_date', type: 'date', nullable: true })
  continuedTargetEndDate!: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @VersionColumn({ name: 'version' })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
