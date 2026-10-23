import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { StaffAccount } from '../database/entities/staff-account.entity';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [TypeOrmModule.forFeature([StaffAccount]), AuthModule],
  controllers: [StaffController],
  providers: [StaffService],
})
export class StaffModule {}
