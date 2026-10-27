import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WebPushService } from './web-push.service';
import { WebSessionService } from './web-session.service';

@Injectable()
export class WebPushScheduler {
  private readonly logger = new Logger(WebPushScheduler.name);
  private running = false;

  constructor(
    private readonly push: WebPushService,
    private readonly sessions: WebSessionService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.push.sendDueReminders();
      if (result.sent || result.failed) {
        this.logger.log(
          `Web Push pengingat obat: ${result.sent} terkirim, ${result.failed} gagal.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Web Push scheduler gagal: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: 'Asia/Jakarta' })
  async cleanup(): Promise<void> {
    try {
      const removed = await this.sessions.purgeExpired(30);
      if (removed)
        this.logger.log(`${removed} sesi web kedaluwarsa dibersihkan.`);
    } catch (error) {
      this.logger.error(
        `Pembersihan sesi web gagal: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
