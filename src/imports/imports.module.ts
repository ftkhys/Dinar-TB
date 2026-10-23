import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Patient } from '../database/entities/patient.entity';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';
import { SettingsModule } from '../settings/settings.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  imports: [AuthModule, SettingsModule, TypeOrmModule.forFeature([Patient, TreatmentCourse])],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
