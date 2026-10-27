import { Repository } from 'typeorm';
import * as webpush from 'web-push';
import { WebPushDelivery } from '../database/entities/web-push-delivery.entity';
import { WebPushSubscription } from '../database/entities/web-push-subscription.entity';
import { WebPushService } from './web-push.service';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

const sendNotification = webpush.sendNotification as jest.MockedFunction<
  typeof webpush.sendNotification
>;

function buildService(
  adherenceRows: Array<{ treatmentCourseId: string; date: string }> = [],
) {
  const claimed = new Set<string>();
  const targets = [
    {
      id: 'subscription-1',
      patientId: 'patient-1',
      patientName: 'Pasien Uji',
      treatmentCourseId: 'treatment-1',
      endpoint: 'https://example.test/push/1',
      p256dh: 'p256dh',
      auth: 'auth',
    },
  ];
  const dataSource = {
    query: jest.fn((sql: string, params: unknown[]) => {
      if (sql.includes('FROM web_push_subscriptions'))
        return Promise.resolve(targets);
      if (sql.includes('FROM daily_adherence'))
        return Promise.resolve(adherenceRows);
      if (sql.includes('INSERT INTO web_push_deliveries')) {
        const key = `${params[0]}:${params[1]}:${params[2]}`;
        if (claimed.has(key)) return Promise.resolve([]);
        claimed.add(key);
        return Promise.resolve([{ id: key }]);
      }
      if (sql.includes('DELETE FROM web_push_deliveries')) {
        claimed.delete(`${params[0]}:${params[1]}:${params[2]}`);
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    }),
  };
  const settings = {
    reminderWindows: jest.fn().mockResolvedValue([
      { start: '06:00', end: '07:00' },
      { start: '20:00', end: '21:00' },
    ]),
  };
  const subscriptions = {
    update: jest.fn().mockResolvedValue(undefined),
    increment: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    findOneBy: jest
      .fn()
      .mockResolvedValue({ id: 'subscription-1', failureCount: 1 }),
  };
  const deliveries = {
    delete: jest.fn(
      (where: { patientId: string; localDate: string; slot: string }) => {
        claimed.delete(`${where.patientId}:${where.localDate}:${where.slot}`);
        return Promise.resolve(undefined);
      },
    ),
  };
  const config = {
    get: (key: string) =>
      ({
        WEB_PUSH_PUBLIC_KEY: 'public',
        WEB_PUSH_PRIVATE_KEY: 'private',
        WEB_PUSH_SUBJECT: 'mailto:test@example.id',
      })[key],
  };
  const service = new WebPushService(
    config as never,
    settings as never,
    dataSource as never,
    subscriptions as unknown as Repository<WebPushSubscription>,
    deliveries as unknown as Repository<WebPushDelivery>,
  );
  return { service, dataSource, settings, subscriptions, deliveries, claimed };
}

describe('WebPushService reminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendNotification.mockResolvedValue({} as never);
  });

  it('sends once during the morning grace window and claims the delivery', async () => {
    const { service, claimed } = buildService();
    const now = new Date('2026-10-24T23:05:00.000Z');

    await expect(service.sendDueReminders(now)).resolves.toEqual({
      sent: 1,
      failed: 0,
    });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(claimed.size).toBe(1);

    await expect(service.sendDueReminders(now)).resolves.toEqual({
      sent: 0,
      failed: 0,
    });
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('does not send when the patient already confirmed the due date', async () => {
    const { service, claimed } = buildService([
      { treatmentCourseId: 'treatment-1', date: '2026-10-25' },
    ]);
    const now = new Date('2026-10-24T23:05:00.000Z');

    await expect(service.sendDueReminders(now)).resolves.toEqual({
      sent: 0,
      failed: 0,
    });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(claimed.size).toBe(0);
  });

  it('does not send outside the configured grace window', async () => {
    const { service } = buildService();
    const now = new Date('2026-10-24T23:30:00.000Z');

    await expect(service.sendDueReminders(now)).resolves.toEqual({
      sent: 0,
      failed: 0,
    });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('releases the delivery claim and counts a failure when every push fails', async () => {
    const { service, claimed, deliveries, subscriptions } = buildService();
    sendNotification.mockRejectedValueOnce(
      Object.assign(new Error('network'), { statusCode: 500 }),
    );
    const now = new Date('2026-10-24T23:05:00.000Z');

    await expect(service.sendDueReminders(now)).resolves.toEqual({
      sent: 0,
      failed: 1,
    });
    expect(claimed.size).toBe(0);
    expect(deliveries.delete).toHaveBeenCalledWith({
      patientId: 'patient-1',
      localDate: '2026-10-25',
      slot: 'morning',
    });
    expect(subscriptions.increment).toHaveBeenCalled();
  });

  it('removes a subscription that the push service reports as gone', async () => {
    const { service, subscriptions } = buildService();
    sendNotification.mockRejectedValueOnce(
      Object.assign(new Error('gone'), { statusCode: 410 }),
    );
    const now = new Date('2026-10-24T23:05:00.000Z');

    await expect(service.sendDueReminders(now)).resolves.toEqual({
      sent: 0,
      failed: 1,
    });
    expect(subscriptions.delete).toHaveBeenCalledWith({ id: 'subscription-1' });
  });

  it('stays idle when VAPID configuration is missing', async () => {
    const { service, dataSource } = buildService();
    const unconfigured = new WebPushService(
      { get: () => undefined } as never,
      { reminderWindows: jest.fn() } as never,
      dataSource as never,
      {} as never,
      {} as never,
    );

    await expect(unconfigured.sendDueReminders(new Date())).resolves.toEqual({
      sent: 0,
      failed: 0,
    });
    expect(dataSource.query).not.toHaveBeenCalled();
    expect(service).toBeTruthy();
  });
});
