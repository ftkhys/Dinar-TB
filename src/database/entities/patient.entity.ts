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

  @Column({ type: 'varchar', length: 32, nullable: true, select: false })
  nik!: string | null;

  @Column({ name: 'pmo_name', type: 'varchar', length: 200, nullable: true })
  pmoName!: string | null;

  @Column({ name: 'pmo_contact', type: 'varchar', length: 100, nullable: true })
  pmoContact!: string | null;

  @Column({ name: 'created_by_staff_id', type: 'uuid', nullable: true })
  createdByStaffId!: string | null;

  @VersionColumn({ name: 'version' })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
