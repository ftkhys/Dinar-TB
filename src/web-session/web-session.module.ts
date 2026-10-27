import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdherenceModule } from '../adherence/adherence.module';
import { ActivationModule } from '../devices/activation.module';
import { PatientWebSession } from '../database/entities/patient-web-session.entity';
import { WebPushDelivery } from '../database/entities/web-push-delivery.entity';
import { WebPushSubscription } from '../database/entities/web-push-subscription.entity';
import { SettingsModule } from '../settings/settings.module';
import { WebPushController } from './web-push.controller';
import { WebPushScheduler } from './web-push.scheduler';
import { WebPushService } from './web-push.service';
import { WebSessionController } from './web-session.controller';
import { WebSessionGuard } from './web-session.guard';
import { WebSessionService } from './web-session.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PatientWebSession,
      WebPushSubscription,
      WebPushDelivery,
    ]),
    ActivationModule,
    AdherenceModule,
    SettingsModule,
  ],
  controllers: [WebSessionController, WebPushController],
  providers: [
    WebSessionService,
    WebSessionGuard,
    WebPushService,
    WebPushScheduler,
  ],
})
export class WebSessionModule {}
