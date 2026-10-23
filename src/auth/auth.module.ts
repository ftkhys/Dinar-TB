import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientDevice } from '../database/entities/patient-device.entity';
import { StaffAccount } from '../database/entities/staff-account.entity';
import { AdminGuard } from './admin.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DeviceAuthGuard } from './device-auth.guard';
import { StaffAuthGuard } from './staff-auth.guard';

@Module({
  imports: [TypeOrmModule.forFeature([StaffAccount, PatientDevice])],
  controllers: [AuthController],
  providers: [AuthService, StaffAuthGuard, DeviceAuthGuard, AdminGuard],
  exports: [AuthService, StaffAuthGuard, DeviceAuthGuard, AdminGuard],
})
export class AuthModule {}
