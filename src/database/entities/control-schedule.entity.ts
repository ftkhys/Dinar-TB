import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  Index,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { StaffAccount } from './staff-account.entity';
import { TreatmentCourse } from './treatment-course.entity';
import { ControlVisit } from './control-visit.entity';

@Entity('control_schedule')
@Index('IDX_control_schedule_scheduled_date', ['scheduledDate'])
export class ControlSchedule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'treatment_course_id', type: 'uuid', unique: true })
  treatmentCourseId!: string;

  @OneToOne(() => TreatmentCourse, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'treatment_course_id' })
  treatmentCourse!: TreatmentCourse;

  @Column({ name: 'reference_visit_id', type: 'uuid', nullable: true })
  referenceVisitId!: string | null;

  @ManyToOne(() => ControlVisit, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'reference_visit_id', referencedColumnName: 'id' },
    { name: 'treatment_course_id', referencedColumnName: 'treatmentCourseId' },
  ])
  referenceVisit!: ControlVisit | null;

  @Column({ name: 'default_date', type: 'date', nullable: true })
  defaultDate!: string | null;

  @Column({ name: 'scheduled_date', type: 'date' })
  scheduledDate!: string;

  @Column({ name: 'overridden_by_staff_id', type: 'uuid', nullable: true })
  overriddenByStaffId!: string | null;

  @ManyToOne(() => StaffAccount, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'overridden_by_staff_id' })
  overriddenBy!: StaffAccount | null;

  @Column({ name: 'overridden_at', type: 'timestamptz', nullable: true })
  overriddenAt!: Date | null;

  @VersionColumn({ name: 'version' })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
