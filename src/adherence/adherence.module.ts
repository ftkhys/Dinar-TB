import { AuthModule } from '../auth/auth.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyAdherence } from '../database/entities/daily-adherence.entity';
import { PatientDevice } from '../database/entities/patient-device.entity';
import { SyncReceipt } from '../database/entities/sync-receipt.entity';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';
import { AdherenceController } from './adherence.controller';
import { AdherenceService } from './adherence.service';

@Module({
  imports: [TypeOrmModule.forFeature([DailyAdherence, PatientDevice, SyncReceipt, TreatmentCourse]), AuthModule],
  controllers: [AdherenceController],
  providers: [AdherenceService],
})
export class AdherenceModule {}
