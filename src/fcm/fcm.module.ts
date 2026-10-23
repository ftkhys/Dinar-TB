import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientDevice } from '../database/entities/patient-device.entity';
import { AuthModule } from '../auth/auth.module';
import { FcmService } from './fcm.service';
import { FcmController } from './fcm.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PatientDevice]), AuthModule],
  controllers: [FcmController],
  providers: [FcmService],
  exports: [FcmService],
})
export class FcmModule {}