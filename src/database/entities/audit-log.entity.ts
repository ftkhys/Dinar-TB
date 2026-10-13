import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_logs')
@Index('IDX_audit_logs_object', ['objectType', 'objectId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'actor_staff_id', type: 'uuid', nullable: true })
  actorStaffId!: string | null;

  @Column({ name: 'object_type', type: 'varchar', length: 80 })
  objectType!: string;

  @Column({ name: 'object_id', type: 'uuid' })
  objectId!: string;

  @Column({ type: 'varchar', length: 80 })
  action!: string;

  @Column({ type: 'text', nullable: true })
  details!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
