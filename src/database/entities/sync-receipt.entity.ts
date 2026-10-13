import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { PatientDevice } from './patient-device.entity';

@Entity('sync_receipts')
@Unique('UQ_sync_receipts_device_operation', ['deviceId', 'operationId'])
export class SyncReceipt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'device_id', type: 'uuid' })
  deviceId!: string;

  @ManyToOne(() => PatientDevice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device!: PatientDevice;

  @Column({ name: 'operation_id', type: 'uuid' })
  operationId!: string;

  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash!: string;

  @Column({ name: 'resource_id', type: 'uuid', nullable: true })
  resourceId!: string | null;

  @Column({ name: 'server_version', type: 'integer', nullable: true })
  serverVersion!: number | null;

  @Column({ name: 'result_code', type: 'varchar', length: 24 })
  resultCode!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
