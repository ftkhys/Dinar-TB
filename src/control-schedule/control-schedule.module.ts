import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ControlSchedule } from '../database/entities/control-schedule.entity';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';
import { AuthModule } from '../auth/auth.module';
import { ControlScheduleController } from './control-schedule.controller';
import { ControlScheduleService } from './control-schedule.service';

@Module({
  imports: [TypeOrmModule.forFeature([ControlSchedule, TreatmentCourse]), AuthModule],
  controllers: [ControlScheduleController],
  providers: [ControlScheduleService],
})
export class ControlScheduleModule {}
