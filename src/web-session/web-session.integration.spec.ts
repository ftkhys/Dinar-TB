import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import * as webpush from 'web-push';
import { AdherenceService } from '../adherence/adherence.service';
import { DailyAdherence } from '../database/entities/daily-adherence.entity';
import { PatientDevice } from '../database/entities/patient-device.entity';
import { PatientWebSession } from '../database/entities/patient-web-session.entity';
import { SyncReceipt } from '../database/entities/sync-receipt.entity';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';
import { WebPushDelivery } from '../database/entities/web-push-delivery.entity';
import { WebPushSubscription } from '../database/entities/web-push-subscription.entity';
import { dataSource } from '../database/data-source';
import { hashActivationCode } from '../devices/activation.service';
import { WebPushService } from './web-push.service';
import { WebSessionService } from './web-session.service';

const runDb = process.env.RUN_DB_TESTS === '1';
const describeDb = runDb ? describe : describe.skip;

describeDb('patient web sessions and web adherence (integration)', () => {
  let ds: DataSource;
  let sessions: WebSessionService;
  let push: WebPushService;
  let adherence: AdherenceService;
  const patientId = randomUUID();
  const staffId = randomUUID();
  const codeId = randomUUID();
  const treatmentId = randomUUID();
  const activationCode = 'WEB12345';
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const startDate = new Date(Date.now() - 3 * 86400000)
    .toISOString()
    .slice(0, 10);
  const targetDate = new Date(Date.now() + 180 * 86400000)
    .toISOString()
    .slice(0, 10);

  beforeAll(async () => {
    if (!/test/i.test(process.env.DB_DATABASE ?? '')) {
      throw new Error('Integration tests require a dedicated test database.');
    }
    ds = dataSource;
    if (!ds.isInitialized) await ds.initialize();

    await ds.query(
      `INSERT INTO staff_accounts (id, username, password_hash, role, display_name, must_change_password)
       VALUES ($1, $2, $3, 'Petugas', 'Petugas Uji Web', false)`,
      [staffId, `web-test-${staffId.slice(0, 8)}`, 'not-used'],
    );
    await ds.query(
      `INSERT INTO patients (id, full_name, register_number, medical_record_number, address)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        patientId,
        'Pasien Uji Web',
        `WEB-${patientId.slice(0, 8)}`,
        `MRN-${patientId.slice(0, 8)}`,
        'Alamat Uji Web',
      ],
    );
    await ds.query(
      `INSERT INTO activation_codes (id, patient_id, code_hash, expires_at, issued_by_staff_id)
       VALUES ($1, $2, $3, now() + interval '1 day', $4)`,
      [codeId, patientId, hashActivationCode(activationCode), staffId],
    );
    await ds.query(
      `INSERT INTO treatment_courses (id, patient_id, start_date, initial_target_end_date, version)
       VALUES ($1, $2, $3, $4, 5)`,
      [treatmentId, patientId, startDate, targetDate],
    );

    sessions = new WebSessionService(ds.getRepository(PatientWebSession), ds, {
      record: jest.fn().mockResolvedValue(undefined),
    } as never);
    const keys = webpush.generateVAPIDKeys();
    push = new WebPushService(
      {
        get: (key: string) =>
          ({
            WEB_PUSH_PUBLIC_KEY: keys.publicKey,
            WEB_PUSH_PRIVATE_KEY: keys.privateKey,
            WEB_PUSH_SUBJECT: 'mailto:test@example.id',
          })[key],
      } as never,
      {} as never,
      ds,
      ds.getRepository(WebPushSubscription),
      ds.getRepository(WebPushDelivery),
    );
    adherence = new AdherenceService(
      ds.getRepository(TreatmentCourse),
      ds.getRepository(DailyAdherence),
      ds.getRepository(PatientDevice),
      ds,
      {} as never,
    );
  });

  afterAll(async () => {
    if (!ds?.isInitialized) return;
    await ds.query(
      'DELETE FROM daily_adherence WHERE treatment_course_id = $1',
      [treatmentId],
    );
    await ds.query('DELETE FROM web_push_subscriptions WHERE patient_id = $1', [
      patientId,
    ]);
    await ds.query('DELETE FROM patient_web_sessions WHERE patient_id = $1', [
      patientId,
    ]);
    await ds.query('DELETE FROM treatment_courses WHERE id = $1', [
      treatmentId,
    ]);
    await ds.query('DELETE FROM activation_codes WHERE id = $1', [codeId]);
    await ds.query('DELETE FROM patients WHERE id = $1', [patientId]);
    await ds.query('DELETE FROM staff_accounts WHERE id = $1', [staffId]);
    await ds.destroy();
  });

  it('activates a browser session without creating or changing an Android device', async () => {
    const before = await ds.query(
      'SELECT count(*)::int AS count FROM patient_devices WHERE patient_id = $1',
      [patientId],
    );
    const result = await sessions.activate(activationCode, 'web-test-client', {
      userAgent: 'integration-test',
      ip: '127.0.0.1',
    });
    const after = await ds.query(
      'SELECT count(*)::int AS count FROM patient_devices WHERE patient_id = $1',
      [patientId],
    );

    expect(result.token).toHaveLength(43);
    expect(result.session.patient.fullName).toBe('Pasien Uji Web');
    expect(before[0].count).toBe(0);
    expect(after[0].count).toBe(0);
    expect(await sessions.resolve(result.token)).toMatchObject({
      patientId,
      patient: { fullName: 'Pasien Uji Web' },
    });
  });

  it('rejects a code that was already used by the browser session', async () => {
    await expect(
      sessions.activate(activationCode, 'web-test-client-2', {}),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('confirms today once, rejects a foreign patient, and rejects a non-today date', async () => {
    const first = await adherence.confirmWeb(patientId, treatmentId, {
      expectedTreatmentVersion: 5,
    });
    expect(first).toMatchObject({ code: 'APPLIED' });

    const duplicate = await adherence.confirmWeb(patientId, treatmentId, {
      expectedTreatmentVersion: 5,
    });
    expect(duplicate).toMatchObject({ code: 'DUPLICATE' });

    await expect(
      adherence.confirmWeb(randomUUID(), treatmentId, {
        expectedTreatmentVersion: 5,
      }),
    ).rejects.toMatchObject({ status: 404 });

    await expect(
      adherence.confirmWeb(patientId, treatmentId, {
        adherenceDate: new Date(Date.now() + 86400000)
          .toISOString()
          .slice(0, 10),
        expectedTreatmentVersion: 5,
      }),
    ).rejects.toMatchObject({ status: 400 });

    const rows = await ds.query(
      `SELECT to_char(adherence_date, 'YYYY-MM-DD') AS date FROM daily_adherence WHERE treatment_course_id = $1`,
      [treatmentId],
    );
    expect(rows).toEqual([{ date: today }]);
  });

  it('binds a push subscription to the session and removes it on logout', async () => {
    const session = await ds
      .getRepository(PatientWebSession)
      .findOneByOrFail({ patientId });
    const result = await push.subscribe(patientId, session.id, {
      endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
      expirationTime: null,
      keys: { p256dh: 'p'.repeat(32), auth: 'a'.repeat(16) },
    });

    expect(result.id).toBeTruthy();
    await expect(push.subscriptionCount(session.id)).resolves.toBe(1);

    await sessions.revoke(session.id);
    await expect(push.subscriptionCount(session.id)).resolves.toBe(0);
    await expect(sessions.resolve('not-a-real-token')).rejects.toMatchObject({
      status: 401,
    });
  });

  it('rejects invalid push endpoints and keys', async () => {
    await expect(
      push.subscribe(patientId, randomUUID(), {
        endpoint: 'http://insecure.test/push',
        keys: { p256dh: 'p', auth: 'a' },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      push.subscribe(patientId, randomUUID(), {
        endpoint: 'https://fcm.googleapis.com/fcm/send/missing-keys',
        keys: {},
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      push.subscribe(patientId, randomUUID(), {
        endpoint: 'https://127.0.0.1/internal',
        keys: { p256dh: 'p'.repeat(32), auth: 'a'.repeat(16) },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      push.subscribe(patientId, randomUUID(), {
        endpoint: 'https://evil.example/push',
        keys: { p256dh: 'p'.repeat(32), auth: 'a'.repeat(16) },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      push.subscribe(patientId, randomUUID(), {
        endpoint: 'https://fcm.googleapis.com/fcm/send/bad-expiry',
        expirationTime: 'not-a-timestamp',
        keys: { p256dh: 'p'.repeat(32), auth: 'a'.repeat(16) },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
