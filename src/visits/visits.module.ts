import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ControlSchedule } from '../database/entities/control-schedule.entity';
import { ControlVisit } from '../database/entities/control-visit.entity';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';
import { AuthModule } from '../auth/auth.module';
import { SettingsModule } from '../settings/settings.module';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

@Module({
  imports: [TypeOrmModule.forFeature([ControlVisit, ControlSchedule, TreatmentCourse]), AuthModule, SettingsModule],
  controllers: [VisitsController],
  providers: [VisitsService],
})
export class VisitsModule {}
