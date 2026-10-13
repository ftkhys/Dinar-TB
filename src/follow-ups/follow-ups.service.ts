import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogService } from '../common/audit-log.service';
import { optionalString } from '../common/input';
import { ControlSchedule } from '../database/entities/control-schedule.entity';
import { FollowUp } from '../database/entities/follow-up.entity';
import { FollowUpOutcome } from '../database/enums';

@Injectable()
export class FollowUpsService {
  constructor(
    @InjectRepository(FollowUp) private readonly followUps: Repository<FollowUp>,
    @InjectRepository(ControlSchedule) private readonly schedules: Repository<ControlSchedule>,
    private readonly audit: AuditLogService,
  ) {}

  async create(scheduleId: string, input: Record<string, unknown>, staffId: string): Promise<FollowUp> {
    if (!(await this.schedules.existsBy({ id: scheduleId }))) throw new NotFoundException('Jadwal kontrol tidak ditemukan.');
    if (!Object.values(FollowUpOutcome).includes(input.outcome as FollowUpOutcome)) {
      throw new BadRequestException('Status follow-up tidak valid.');
    }
    const followUp = await this.followUps.save(this.followUps.create({
      controlScheduleId: scheduleId,
      outcome: input.outcome as FollowUpOutcome,
      note: optionalString(input.note, 'Catatan follow-up', 2000),
      recordedByStaffId: staffId,
    }));
    await this.audit.record({ actorStaffId: staffId, objectType: 'follow_up', objectId: followUp.id, action: 'recorded', details: followUp.outcome });
    return followUp;
  }

  async list(scheduleId: string): Promise<FollowUp[]> {
    if (!(await this.schedules.existsBy({ id: scheduleId }))) throw new NotFoundException('Jadwal kontrol tidak ditemukan.');
    return this.followUps.find({ where: { controlScheduleId: scheduleId }, order: { createdAt: 'DESC' } });
  }
}
