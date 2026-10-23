import { AuthModule } from '../auth/auth.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ControlSchedule } from '../database/entities/control-schedule.entity';
import { FollowUp } from '../database/entities/follow-up.entity';
import { FollowUpsController } from './follow-ups.controller';
import { FollowUpsService } from './follow-ups.service';
import { ControlAlertsService } from './control-alerts.service';
import { ControlAlertsController } from './control-alerts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ControlSchedule, FollowUp]), AuthModule],
  controllers: [FollowUpsController, ControlAlertsController],
  providers: [FollowUpsService, ControlAlertsService],
  exports: [ControlAlertsService],
})
export class FollowUpsModule {}
