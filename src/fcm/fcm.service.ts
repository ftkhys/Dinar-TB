import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getMessaging, Messaging, Message, BatchResponse } from 'firebase-admin/messaging';
import { ScheduleChangedEvent } from '../control-schedule/control-schedule.service';

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private app: App | null = null;
  private messaging: Messaging | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.initializeFirebase();
    this.subscribeToEvents();
  }

  private async initializeFirebase(): Promise<void> {
    const serviceAccountPath = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
    const serviceAccountJson = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');

    if (!serviceAccountPath && !serviceAccountJson) {
      this.logger.warn('Firebase credentials not configured. FCM push notifications disabled.');
      return;
    }

    try {
      if (getApps().length === 0) {
        if (serviceAccountJson) {
          const serviceAccount = JSON.parse(serviceAccountJson);
          this.app = initializeApp({ credential: cert(serviceAccount) });
        } else if (serviceAccountPath) {
          this.app = initializeApp({ credential: cert(serviceAccountPath) });
        }
      } else {
        this.app = getApps()[0];
      }

      this.messaging = getMessaging(this.app!);
      this.logger.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize Firebase Admin SDK: ${error.message}`, error.stack);
    }
  }

  private subscribeToEvents(): void {
    this.eventEmitter.on('schedule.changed', async (event: ScheduleChangedEvent) => {
      await this.sendScheduleChangeNotification(event);
    });
  }

  private async sendScheduleChangeNotification(event: ScheduleChangedEvent): Promise<void> {
    if (!this.messaging) {
      this.logger.warn('FCM not initialized, skipping push notification');
      return;
    }

    try {
      // Get FCM token for the patient
      const token = await this.getFcmTokenForPatient(event.treatmentCourseId);
      if (!token) {
        this.logger.debug(`No FCM token for treatment ${event.treatmentCourseId}, skipping push`);
        return;
      }

      const message: Message = {
        token,
        data: {
          type: 'schedule_changed',
          treatmentCourseId: event.treatmentCourseId,
          previousDate: event.previousDate ?? '',
          newDate: event.newDate,
          version: String(event.version),
          changedAt: event.changedAt.toISOString(),
        },
        android: {
          priority: 'high',
        },
        apns: {
          payload: {
            aps: {
              contentAvailable: true,
            },
          },
        },
      };

      const response = await this.messaging.send(message);
      this.logger.log(`FCM push sent for treatment ${event.treatmentCourseId}: ${response}`);
    } catch (error) {
      await this.handleSendError(error, event.treatmentCourseId);
    }
  }

  private async getFcmTokenForPatient(treatmentCourseId: string): Promise<string | null> {
    const result = await this.dataSource.query(
      `SELECT pd.fcm_token
       FROM patient_devices pd
       JOIN treatment_courses tc ON tc.patient_id = pd.patient_id
       WHERE tc.id = $1
         AND pd.deactivated_at IS NULL
         AND pd.fcm_token IS NOT NULL
       LIMIT 1`,
      [treatmentCourseId],
    );
    return result[0]?.fcm_token ?? null;
  }

  private async handleSendError(error: unknown, treatmentCourseId: string): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = (error as any)?.code;

    this.logger.error(`FCM send failed for treatment ${treatmentCourseId}: ${errorMessage}`);

    // Handle specific FCM error codes
    if (errorCode === 'messaging/invalid-registration-token' ||
        errorCode === 'messaging/registration-token-not-registered' ||
        errorMessage.includes('INVALID_ARGUMENT') && errorMessage.includes('token')) {
      await this.invalidateFcmToken(treatmentCourseId);
    }

    // Log to audit but don't throw - don't block schedule persistence
    await this.dataSource.query(
      `INSERT INTO audit_logs (actor_staff_id, object_type, object_id, action, details)
       VALUES (NULL, 'fcm_notification', $1, 'send_failed', $2)`,
      [treatmentCourseId, errorMessage],
    );
  }

  private async invalidateFcmToken(treatmentCourseId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE patient_devices pd
       SET fcm_token = NULL
       FROM treatment_courses tc
       WHERE pd.patient_id = tc.patient_id
         AND tc.id = $1
         AND pd.deactivated_at IS NULL`,
      [treatmentCourseId],
    );
    this.logger.log(`Invalidated FCM token for treatment ${treatmentCourseId}`);
  }

  // Public method for device to register/update FCM token
  async registerFcmToken(deviceId: string, token: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE patient_devices SET fcm_token = $1 WHERE id = $2 AND deactivated_at IS NULL`,
      [token, deviceId],
    );
    this.logger.log(`FCM token registered for device ${deviceId}`);
  }
}