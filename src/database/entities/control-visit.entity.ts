import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  VersionColumn,
} from 'typeorm';
import { Patient } from './patient.entity';
import { StaffAccount } from './staff-account.entity';
import { TreatmentCourse } from './treatment-course.entity';

@Entity('control_visits')
@Check('CHK_control_visits_medication_date', '(medicine_given AND medication_given_on IS NOT NULL) OR (NOT medicine_given AND medication_given_on IS NULL)')
@Unique('UQ_control_visits_id_treatment', ['id', 'treatmentCourseId'])
export class ControlVisit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId!: string;

  @ManyToOne(() => Patient, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'patient_id' })
  patient!: Patient;

  @Column({ name: 'treatment_course_id', type: 'uuid' })
  treatmentCourseId!: string;

  @ManyToOne(() => TreatmentCourse, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'treatment_course_id', referencedColumnName: 'id' },
    { name: 'patient_id', referencedColumnName: 'patientId' },
  ])
  treatmentCourse!: TreatmentCourse;

  @Column({ name: 'visit_date', type: 'date' })
  visitDate!: string;

  @Column({ name: 'complaint_progress', type: 'text', nullable: true })
  complaintProgress!: string | null;

  @Column({ name: 'additional_note', type: 'text', nullable: true })
  additionalNote!: string | null;

  @Column({ name: 'medicine_given', type: 'boolean' })
  medicineGiven!: boolean;

  @Column({ name: 'medication_given_on', type: 'date', nullable: true })
  medicationGivenOn!: string | null;

  @Column({ name: 'recorded_by_staff_id', type: 'uuid' })
  recordedByStaffId!: string;

  @ManyToOne(() => StaffAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'recorded_by_staff_id' })
  recordedBy!: StaffAccount;

  @VersionColumn({ name: 'version' })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
