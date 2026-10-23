import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

@Entity('staff_accounts')
export class StaffAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80, unique: true })
  username!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  /** 'Admin' can manage accounts and shared settings; 'Petugas' cannot. */
  @Column({ type: 'varchar', length: 20, default: 'Petugas' })
  role!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 120, nullable: true })
  displayName!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  @Column({ name: 'disabled_at', type: 'timestamptz', nullable: true })
  disabledAt!: Date | null;

  /**
   * Set when an Admin assigns a temporary password. While true the account must
   * change its password before using any other staff endpoint and before the
   * token is treated as fully privileged.
   */
  @Column({ name: 'must_change_password', type: 'boolean', default: false })
  mustChangePassword!: boolean;

  @VersionColumn({ name: 'version' })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
