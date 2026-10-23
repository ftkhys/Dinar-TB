import { AdherenceService } from './adherence.service';
import { SettingsService } from '../settings/settings.service';

type Course = { treatmentCourseId: string; patientId: string; patientName: string; registerNumber: string | null; startDate: string };
type Adherence = { treatmentCourseId: string; adherenceDate: string; confirmedAt: string };

function buildService(courses: Course[], adherence: Adherence[], reminderMorning = '06:00') {
  const query = jest.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('da.treatment_course_id')) return adherence;
    if (sql.includes('FROM treatment_courses')) {
      const today = params?.[0] as string | undefined;
      return today ? courses.filter((item) => item.startDate <= today) : courses;
    }
    return [];
  });
  const settings = {
    reminderWindows: jest.fn().mockResolvedValue([
      { start: reminderMorning, end: '07:00' },
      { start: '20:00', end: '21:00' },
    ]),
  } as unknown as SettingsService;
  return new AdherenceService(null as never, null as never, null as never, { query } as never, settings);
}

const course = (id: string, name: string, register: string, startDate = '2026-10-17'): Course => ({
  treatmentCourseId: id,
  patientId: `patient-${id}`,
  patientName: name,
  registerNumber: register,
  startDate,
});

describe('AdherenceService.listReminders', () => {
  it('counts each active treatment once and splits confirmed vs not confirmed', async () => {
    const service = buildService(
      [course('t1', 'Siti', 'REG-1'), course('t2', 'Ahmad', 'REG-2'), course('t3', 'Rina', 'REG-3')],
      [{ treatmentCourseId: 't1', adherenceDate: '2026-10-17', confirmedAt: '2026-10-17T00:18:00.000Z' }],
    );

    const result = await service.listReminders(undefined, new Date('2026-10-17T03:00:00.000Z'));

    expect(result.date).toBe('2026-10-17');
    expect(result.timeZone).toBe('Asia/Jakarta');
    expect(result.stats).toEqual({ active: 3, confirmed: 1, notConfirmed: 2, needsAttention: 0 });
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toMatchObject({ patientName: 'Siti', status: 'Sudah Konfirmasi' });
    expect(result.rows[0].confirmedAt).toBe('2026-10-17T00:18:00.000Z');
  });

  it('uses the WIB day: 17:00 UTC rolls over to the next Jakarta day', async () => {
    const courses = [course('t1', 'Siti', 'REG-1')];
    const adherence = [{ treatmentCourseId: 't1', adherenceDate: '2026-10-17', confirmedAt: '2026-10-16T23:30:00.000Z' }];

    const before = buildService(courses, adherence);
    const atBoundary = buildService(courses, adherence);

    const late = await before.listReminders(undefined, new Date('2026-10-16T16:59:00.000Z'));
    expect(late.date).toBe('2026-10-16');
    expect(late.stats.confirmed).toBe(0);

    const next = await atBoundary.listReminders(undefined, new Date('2026-10-16T17:00:00.000Z'));
    expect(next.date).toBe('2026-10-17');
    expect(next.stats.confirmed).toBe(1);
  });

  it('never marks today as missed while the day runs, but flags a 2-day streak', async () => {
    const service = buildService(
      [course('t1', 'Ahmad', 'REG-2', '2026-10-10')],
      [
        { treatmentCourseId: 't1', adherenceDate: '2026-10-14', confirmedAt: '2026-10-14T00:10:00.000Z' },
      ],
    );

    const result = await service.listReminders(undefined, new Date('2026-10-17T03:00:00.000Z'));

    expect(result.rows[0].status).toBe('Belum Konfirmasi');
    expect(result.rows[0].missedStreak).toBe(2);
    expect(result.stats.needsAttention).toBe(1);
  });

  it('filters rows by search but keeps statistics for every active treatment', async () => {
    const service = buildService(
      [course('t1', 'Siti Nur', 'REG-1'), course('t2', 'Ahmad Fauzan', 'REG-2')],
      [],
    );

    const result = await service.listReminders('ahmad', new Date('2026-10-17T03:00:00.000Z'));

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].patientName).toBe('Ahmad Fauzan');
    expect(result.stats.active).toBe(2);
    expect(result.stats.notConfirmed).toBe(2);
  });

  it('exposes the configured reminder time', async () => {
    const service = buildService([course('t1', 'Siti', 'REG-1')], [], '07:30');
    const result = await service.listReminders(undefined, new Date('2026-10-17T03:00:00.000Z'));
    expect(result.reminderMorning).toBe('07:30');
    expect(result.rows[0].reminderTime).toBe('07:30');
  });

  it('excludes future-start treatments from today reminders and active counts', async () => {
    const service = buildService([
      course('started', 'Siti', 'REG-1', '2026-10-16'),
      course('future', 'Rina', 'REG-2', '2026-10-18'),
    ], []);

    const result = await service.listReminders(undefined, new Date('2026-10-17T03:00:00.000Z'));

    expect(result.stats.active).toBe(1);
    expect(result.rows.map((row) => row.treatmentCourseId)).toEqual(['started']);
    const courseQuery = (service as any).dataSource.query.mock.calls.find(([sql]: [string]) => sql.includes('FROM treatment_courses'));
    expect(courseQuery[0]).toContain('tc.start_date <= $1::date');
    expect(courseQuery[1]).toEqual(['2026-10-17']);
  });
});
