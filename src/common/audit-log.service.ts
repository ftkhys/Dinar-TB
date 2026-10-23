import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

@Injectable()
export class AuditLogService {
  constructor(private readonly dataSource: DataSource) {}

  async record(
    input: {
      actorStaffId?: string | null;
      objectType: string;
      objectId: string;
      action: string;
      details?: string | null;
    },
    manager?: EntityManager,
  ): Promise<void> {
    const queryable = manager ?? this.dataSource;
    await queryable.query(
      `INSERT INTO audit_logs(actor_staff_id, object_type, object_id, action, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.actorStaffId ?? null, input.objectType, input.objectId, input.action, input.details ?? null],
    );
  }
}
