import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FollowUpsModule } from '../follow-ups/follow-ups.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AuthModule, FollowUpsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
