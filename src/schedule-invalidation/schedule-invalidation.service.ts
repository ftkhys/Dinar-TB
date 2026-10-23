import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ScheduleChangedEvent } from '../control-schedule/control-schedule.service';
import { DataSource } from 'typeorm';

@Injectable()
export class ScheduleInvalidationService {
  private readonly logger = new Logger(ScheduleInvalidationService.name);

  constructor(private readonly dataSource: DataSource) {}

  @OnEvent('schedule.changed')
  async handleScheduleChanged(event: ScheduleChangedEvent): Promise<void> {
    this.logger.log(`Schedule changed for treatment ${event.treatmentCourseId}: ${event.previousDate} -> ${event.newDate} (v${event.version})`);

    try {
      await this.dataSource.query(
        `INSERT INTO schedule_invalidations (treatment_course_id, schedule_id, previous_date, new_date, version, changed_at, overridden_by_staff_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (treatment_course_id, version) DO UPDATE SET
           new_date = EXCLUDED.new_date,
           changed_at = EXCLUDED.changed_at,
           overridden_by_staff_id = EXCLUDED.overridden_by_staff_id`,
        [
          event.treatmentCourseId,
          event.scheduleId,
          event.previousDate,
          event.newDate,
          event.version,
          event.changedAt,
          event.overriddenByStaffId,
        ],
      );

      this.logger.log(`Invalidation record created/updated for treatment ${event.treatmentCourseId} v${event.version}`);
    } catch (error) {
      this.logger.error(`Failed to create invalidation record: ${error.message}`, error.stack);
    }
  }
}