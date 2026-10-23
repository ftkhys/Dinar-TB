import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

@Entity('patients')
@Index('IDX_patients_register', ['registerNumber'])
@Index('IDX_patients_medical_record', ['medicalRecordNumber'])
@Index('IDX_patients_archived_at', ['archivedAt'])
@Index('IDX_patients_anonymized_at', ['anonymizedAt'])
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 200 })
  fullName!: string;

  @Column({ name: 'register_number', type: 'varchar', length: 100 })
  registerNumber!: string;

  @Column({ name: 'medical_record_number', type: 'varchar', length: 100 })
  medicalRecordNumber!: string;

  @Column({ type: 'text' })
  address!: string;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true, select: false })
  nik!: string | null;

  @Column({ name: 'pmo_name', type: 'varchar', length: 200, nullable: true })
  pmoName!: string | null;

  @Column({ name: 'pmo_contact', type: 'varchar', length: 100, nullable: true })
  pmoContact!: string | null;

  @Column({ name: 'created_by_staff_id', type: 'uuid', nullable: true })
  createdByStaffId!: string | null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @Column({ name: 'anonymized_at', type: 'timestamptz', nullable: true })
  anonymizedAt!: Date | null;

  @VersionColumn({ name: 'version' })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
