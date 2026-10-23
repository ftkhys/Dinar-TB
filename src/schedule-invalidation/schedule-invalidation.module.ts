import { Module } from '@nestjs/common';
import { ScheduleInvalidationService } from './schedule-invalidation.service';

@Module({
  providers: [ScheduleInvalidationService],
  exports: [ScheduleInvalidationService],
})
export class ScheduleInvalidationModule {}