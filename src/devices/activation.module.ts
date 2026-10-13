import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivationCode } from '../database/entities/activation-code.entity';
import { Patient } from '../database/entities/patient.entity';
import { PatientDevice } from '../database/entities/patient-device.entity';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';
import { AuthModule } from '../auth/auth.module';
import { ActivationController } from './activation.controller';
import { ActivationService } from './activation.service';
import { PatientDeviceController } from './patient-device.controller';
import { PatientDeviceDataService } from './patient-device-data.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([ActivationCode, Patient, PatientDevice, TreatmentCourse])],
  controllers: [ActivationController, PatientDeviceController],
  providers: [ActivationService, PatientDeviceDataService],
})
export class ActivationModule {}
