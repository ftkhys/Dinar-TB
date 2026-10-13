import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { AdherenceStatus } from '../enums';
import { TreatmentCourse } from './treatment-course.entity';

@Entity('daily_adherence')
@Unique('UQ_daily_adherence_treatment_date', ['treatmentCourseId', 'adherenceDate'])
export class DailyAdherence {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'treatment_course_id', type: 'uuid' })
  treatmentCourseId!: string;

  @ManyToOne(() => TreatmentCourse, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'treatment_course_id' })
  treatmentCourse!: TreatmentCourse;

  @Column({ name: 'adherence_date', type: 'date' })
  adherenceDate!: string;

  @Column({ type: 'enum', enum: AdherenceStatus, enumName: 'adherence_status' })
  status!: AdherenceStatus;

  @Column({ name: 'confirmed_at', type: 'timestamptz' })
  confirmedAt!: Date;

  @Column({ name: 'source_device_id', type: 'uuid', nullable: true })
  sourceDeviceId!: string | null;

  @Column({ name: 'confirmed_by_staff_id', type: 'uuid', nullable: true })
  confirmedByStaffId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
