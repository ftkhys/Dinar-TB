import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AdherenceModule } from './adherence/adherence.module';
import { ActivationModule } from './devices/activation.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './common/audit.module';
import { ControlScheduleModule } from './control-schedule/control-schedule.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FcmModule } from './fcm/fcm.module';
import { FollowUpsModule } from './follow-ups/follow-ups.module';
import { HealthModule } from './health/health.module';
import { ImportsModule } from './imports/imports.module';
import { PatientsModule } from './patients/patients.module';
import { ReportsModule } from './reports/reports.module';
import { ScheduleInvalidationModule } from './schedule-invalidation/schedule-invalidation.module';
import { SettingsModule } from './settings/settings.module';
import { StaffModule } from './staff/staff.module';
import { TreatmentsModule } from './treatments/treatments.module';
import { VisitsModule } from './visits/visits.module';
import { WebSessionModule } from './web-session/web-session.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST', 'localhost'),
        port: Number(config.get<string>('DB_PORT', '5432')),
        username: config.get<string>('DB_USERNAME', 'postgres'),
        password: config.get<string>('DB_PASSWORD', ''),
        database: config.get<string>('DB_DATABASE', 'dinar_tb'),
        ssl: config.get<string>('DB_SSL', 'false') === 'true',
        autoLoadEntities: true,
        synchronize: false,
        migrations: ['dist/database/migrations/*.js'],
        migrationsRun: false,
      }),
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    AuditModule,
    AuthModule,
    StaffModule,
    SettingsModule,
    PatientsModule,
    TreatmentsModule,
    VisitsModule,
    ControlScheduleModule,
    DashboardModule,
    ScheduleInvalidationModule,
    FcmModule,
    FollowUpsModule,
    AdherenceModule,
    ActivationModule,
    ImportsModule,
    ReportsModule,
    HealthModule,
    WebSessionModule,
  ],
})
export class AppModule {}
