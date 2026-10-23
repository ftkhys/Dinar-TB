import { PatientDeviceDataService } from './patient-device-data.service';
import { TreatmentDecision } from '../database/enums';

type QueryMock = jest.Mock<Promise<unknown[]>, [string, unknown[]?]>;

function makeDataSource(
  overrides: Partial<
    Record<
      | 'patients'
      | 'treatment_courses'
      | 'active_course_ids'
      | 'control_schedule'
      | 'control_visits'
      | 'daily_adherence',
      unknown[]
    >
  > = {},
) {
  const query: QueryMock = jest.fn(async (sql: string) => {
    if (sql.includes('FROM patients')) {
      return (
        overrides.patients ?? [
          {
            id: 'patient-1',
            fullName: 'Pasien',
            registerNumber: 'REG-1',
            address: 'Alamat',
            version: 1,
            syncTime: new Date('2026-10-21T03:04:05.000Z'),
          },
        ]
      );
    }
    if (sql.includes('FROM treatment_courses')) {
      // The active-course scope query is independent of the version delta and
      // selects only ids (`SELECT id FROM treatment_courses ... completed_at IS NULL`).
      if (sql.includes('SELECT id FROM treatment_courses')) {
        return overrides.active_course_ids ?? [{ id: 'course-active' }];
      }
      return (
        overrides.treatment_courses ?? [
          {
            id: 'course-active',
            patientId: 'patient-1',
            startDate: '2026-09-01',
            initialTargetEndDate: '2027-03-01',
            finalDecision: null,
            finalReviewNote: null,
            finalReviewedAt: null,
            continuedTargetEndDate: null,
            completedAt: null,
            version: 1,
          },
          {
            id: 'course-completed',
            patientId: 'patient-1',
            startDate: '2026-01-01',
            initialTargetEndDate: '2026-07-01',
            finalDecision: TreatmentDecision.COMPLETED,
            finalReviewNote: null,
            finalReviewedAt: null,
            continuedTargetEndDate: null,
            completedAt: new Date('2026-07-02T00:00:00.000Z'),
            version: 1,
          },
        ]
      );
    }
    if (sql.includes('FROM control_schedule')) {
      return (
        overrides.control_schedule ?? [
          {
            treatmentCourseId: 'course-active',
            scheduledDate: '2026-10-10',
            version: 1,
            referenceVisitId: null,
            defaultDate: null,
            overriddenAt: null,
          },
        ]
      );
    }
    if (sql.includes('FROM control_visits')) {
      return overrides.control_visits ?? [];
    }
    if (sql.includes('FROM daily_adherence')) {
      return overrides.daily_adherence ?? [];
    }
    return [];
  });
  return { query };
}

function makeSettings() {
  return {
    reminderWindows: jest.fn().mockResolvedValue([
      { start: '06:00', end: '07:00' },
      { start: '20:00', end: '21:00' },
    ]),
    clinicInfo: jest
      .fn()
      .mockResolvedValue({ name: 'Puskesmas Jatinegara', phone: '021-123' }),
  };
}

describe('patient device treatment data', () => {
  it('keeps completed treatment history but only returns schedules for active treatments', async () => {
    const dataSource = makeDataSource();
    const settings = makeSettings();
    const service = new PatientDeviceDataService(
      {} as never,
      dataSource as never,
      settings as never,
    );

    const result = await service.getCurrentData('patient-1');

    expect(result.patient.registerNumber).toBe('REG-1');
    expect(result.treatmentCourses.map((course) => course.id)).toEqual([
      'course-active',
      'course-completed',
    ]);
    expect(result.treatmentCourses[1].displayMessage).toBe(
      'Pengobatan selesai',
    );
    expect(result.controlSchedules).toEqual([
      {
        treatmentCourseId: 'course-active',
        scheduledDate: '2026-10-10',
        version: 1,
        referenceVisitId: null,
        defaultDate: null,
        overriddenAt: null,
      },
    ]);
    expect(result.clinic).toEqual({
      name: 'Puskesmas Jatinegara',
      phone: '021-123',
    });
    expect(result.reminderWindows).toHaveLength(2);
  });

  it('keeps future treatment visible but disables reminders and omits its active schedule', async () => {
    const dataSource = makeDataSource({
      treatment_courses: [{
        id: 'course-future',
        patientId: 'patient-1',
        startDate: '2099-01-01',
        initialTargetEndDate: '2099-07-01',
        finalDecision: null,
        finalReviewNote: null,
        finalReviewedAt: null,
        continuedTargetEndDate: null,
        completedAt: null,
        version: 1,
      }],
      active_course_ids: [],
    });
    const service = new PatientDeviceDataService({} as never, dataSource as never, makeSettings() as never);

    const result = await service.getCurrentData('patient-1');

    expect(result.treatmentCourses).toHaveLength(1);
    expect(result.treatmentCourses[0].remindersEnabled).toBe(false);
    expect(result.controlSchedules).toEqual([]);
    const activeCoursesQuery = dataSource.query.mock.calls.find(([sql]) => sql.includes('SELECT id FROM treatment_courses'));
    expect(activeCoursesQuery?.[0]).toContain('start_date <= $2::date');
  });

  it('includes the official archived status in the patient sync payload', async () => {
    const archivedAt = new Date('2026-10-20T08:00:00.000Z');
    const dataSource = makeDataSource({
      patients: [
        {
          id: 'patient-1',
          fullName: 'Pasien',
          registerNumber: 'REG-1',
          address: 'Alamat',
          version: 2,
          archivedAt,
        },
      ],
    });
    const settings = makeSettings();
    const service = new PatientDeviceDataService(
      {} as never,
      dataSource as never,
      settings as never,
    );

    const result = await service.getCurrentData('patient-1');

    expect(result.patient.archivedAt).toEqual(archivedAt);
    const patientCall = dataSource.query.mock.calls.find(([sql]) =>
      sql.includes('FROM patients'),
    );
    expect(patientCall?.[0]).toContain('archived_at AS "archivedAt"');
  });

  it('keeps an active patient explicitly unarchived', async () => {
    const dataSource = makeDataSource();
    const settings = makeSettings();
    const service = new PatientDeviceDataService(
      {} as never,
      dataSource as never,
      settings as never,
    );

    const result = await service.getCurrentData('patient-1');

    expect(result.patient.archivedAt).toBeNull();
  });

  it('binds positional $n placeholders to an ordered parameter array (regression: no named/positional mismatch)', async () => {
    const dataSource = makeDataSource();
    const settings = makeSettings();
    const service = new PatientDeviceDataService(
      {} as never,
      dataSource as never,
      settings as never,
    );

    await service.getSyncData('patient-1', {
      sinceVersion: 3,
      limit: 50,
      offset: 0,
    });

    const courseCall = dataSource.query.mock.calls.find(([sql]) =>
      sql.includes('FROM treatment_courses'),
    );
    expect(courseCall).toBeDefined();
    const [courseSql, courseParams] = courseCall!;
    // The WHERE clause must use $1..$n and the params must be a positional array,
    // never a named-parameter object (which caused "there is no parameter $1").
    expect(courseSql).toContain('patient_id = $1');
    expect(courseSql).toContain('version > $2');
    expect(Array.isArray(courseParams)).toBe(true);
    expect(courseParams).toEqual(['patient-1', 3, 51, 0]);
  });

  it('returns only delta changes when sinceVersion is provided', async () => {
    const dataSource = makeDataSource({
      treatment_courses: [
        {
          id: 'course-active',
          patientId: 'patient-1',
          startDate: '2026-09-01',
          initialTargetEndDate: '2027-03-01',
          finalDecision: null,
          finalReviewNote: null,
          finalReviewedAt: null,
          continuedTargetEndDate: null,
          completedAt: null,
          version: 5,
        },
      ],
      control_schedule: [
        {
          treatmentCourseId: 'course-active',
          scheduledDate: '2026-10-15',
          version: 5,
          referenceVisitId: null,
          defaultDate: null,
          overriddenAt: null,
        },
      ],
    });
    const settings = makeSettings();
    const service = new PatientDeviceDataService(
      {} as never,
      dataSource as never,
      settings as never,
    );

    const result = await service.getSyncData('patient-1', { sinceVersion: 3 });

    expect(result.treatmentCourses).toHaveLength(1);
    expect(result.treatmentCourses[0].version).toBe(5);
    expect(result.controlSchedules).toHaveLength(1);
    expect(result.controlSchedules[0].version).toBe(5);
    expect(result.maxVersion).toBe(5);
    expect(result.maxScheduleVersion).toBe(5);
  });

  it('delivers a schedule-only change even when no treatment course is part of the delta (C-1)', async () => {
    // Admin moved the control date: control_schedule.version bumped to 4, but the
    // treatment course version stayed at 1 and is therefore NOT in the version
    // delta. The schedule must still be returned.
    const dataSource = makeDataSource({
      treatment_courses: [],
      active_course_ids: [{ id: 'course-active' }],
      control_schedule: [
        {
          treatmentCourseId: 'course-active',
          scheduledDate: '2026-11-01',
          version: 4,
          referenceVisitId: null,
          defaultDate: null,
          overriddenAt: null,
        },
      ],
    });
    const settings = makeSettings();
    const service = new PatientDeviceDataService(
      {} as never,
      dataSource as never,
      settings as never,
    );

    const result = await service.getSyncData('patient-1', {
      sinceVersion: 1,
      sinceScheduleVersion: 3,
    });

    expect(result.treatmentCourses).toHaveLength(0);
    expect(result.controlSchedules).toHaveLength(1);
    expect(result.controlSchedules[0].scheduledDate).toBe('2026-11-01');
    expect(result.maxScheduleVersion).toBe(4);
  });

  it('keeps the treatment cursor independent from higher schedule versions (C-2)', async () => {
    // A control-date override can bump control_schedule.version far ahead of
    // the treatment course. If maxVersion included the schedule version, the
    // client would store a course cursor beyond the course and never receive a
    // later completion decision.
    const dataSource = makeDataSource({
      treatment_courses: [
        {
          id: 'course-active',
          patientId: 'patient-1',
          startDate: '2026-09-01',
          initialTargetEndDate: '2027-03-01',
          finalDecision: null,
          finalReviewNote: null,
          finalReviewedAt: null,
          continuedTargetEndDate: null,
          completedAt: null,
          version: 4,
        },
      ],
      control_schedule: [
        {
          treatmentCourseId: 'course-active',
          scheduledDate: '2026-11-01',
          version: 20,
          referenceVisitId: null,
          defaultDate: null,
          overriddenAt: null,
        },
      ],
    });
    const settings = makeSettings();
    const service = new PatientDeviceDataService(
      {} as never,
      dataSource as never,
      settings as never,
    );

    const result = await service.getSyncData('patient-1', {
      sinceVersion: 3,
      sinceScheduleVersion: 3,
    });

    expect(result.treatmentCourses[0].version).toBe(4);
    expect(result.maxVersion).toBe(4);
    expect(result.maxScheduleVersion).toBe(20);
  });

  it('prefers the timestamp cursor over per-row version cursors (multi-course regression)', async () => {
    const dataSource = makeDataSource({
      treatment_courses: [],
      active_course_ids: [{ id: 'course-active' }],
      control_schedule: [],
    });
    const settings = makeSettings();
    const service = new PatientDeviceDataService(
      {} as never,
      dataSource as never,
      settings as never,
    );

    const result = await service.getSyncData('patient-1', {
      sinceVersion: 20,
      sinceScheduleVersion: 20,
      sinceTimestamp: '2026-10-21T03:00:00.000Z',
    });

    const courseCall = dataSource.query.mock.calls.find(([sql]) =>
      sql.includes('FROM treatment_courses') &&
      !sql.includes('SELECT id FROM treatment_courses'),
    );
    expect(courseCall?.[0]).toContain('updated_at > $2');
    expect(courseCall?.[0]).not.toContain('version >');
    expect(courseCall?.[1]).toEqual([
      'patient-1',
      '2026-10-21T03:00:00.000Z',
      101,
      0,
    ]);

    const scheduleCall = dataSource.query.mock.calls.find(([sql]) =>
      sql.includes('FROM control_schedule'),
    );
    expect(scheduleCall?.[0]).toContain('updated_at > $2');
    expect(scheduleCall?.[0]).not.toContain('version >');

    // The cursor is the server clock captured before the queries, not a row's
    // updated_at and not the response generation time.
    expect(result.serverTime).toBe('2026-10-21T03:04:05.000Z');
  });

  it('excludes unchanged schedules when sinceScheduleVersion is at or above the current version (C-1)', async () => {
    const dataSource = makeDataSource({
      active_course_ids: [{ id: 'course-active' }],
      control_schedule: [
        {
          treatmentCourseId: 'course-active',
          scheduledDate: '2026-11-01',
          version: 4,
          referenceVisitId: null,
          defaultDate: null,
          overriddenAt: null,
        },
      ],
    });
    const settings = makeSettings();
    const service = new PatientDeviceDataService(
      {} as never,
      dataSource as never,
      settings as never,
    );

    const result = await service.getSyncData('patient-1', {
      sinceScheduleVersion: 4,
    });

    // The mock ignores the WHERE clause but the parameters must bind the schedule
    // cursor independently of the treatment-course cursor.
    const scheduleCall = dataSource.query.mock.calls.find(([sql]) =>
      sql.includes('FROM control_schedule'),
    );
    expect(scheduleCall).toBeDefined();
    const [scheduleSql, scheduleParams] = scheduleCall!;
    expect(scheduleSql).toContain('version > $2');
    expect(scheduleSql).not.toContain('$3');
    expect(scheduleParams).toEqual([['course-active'], 4]);
  });

  it('scopes schedules to the patient active courses, not to the version-filtered page (C-1)', async () => {
    const dataSource = makeDataSource({
      treatment_courses: [
        {
          id: 'course-other',
          patientId: 'patient-1',
          startDate: '2026-09-01',
          initialTargetEndDate: '2027-03-01',
          finalDecision: null,
          finalReviewNote: null,
          finalReviewedAt: null,
          continuedTargetEndDate: null,
          completedAt: null,
          version: 1,
        },
      ],
      active_course_ids: [{ id: 'course-active' }],
      control_schedule: [
        {
          treatmentCourseId: 'course-active',
          scheduledDate: '2026-11-01',
          version: 2,
          referenceVisitId: null,
          defaultDate: null,
          overriddenAt: null,
        },
      ],
    });
    const settings = makeSettings();
    const service = new PatientDeviceDataService(
      {} as never,
      dataSource as never,
      settings as never,
    );

    await service.getSyncData('patient-1', { sinceVersion: 1 });

    const scheduleCall = dataSource.query.mock.calls.find(([sql]) =>
      sql.includes('FROM control_schedule'),
    );
    expect(scheduleCall).toBeDefined();
    const [, scheduleParams] = scheduleCall!;
    expect(scheduleParams![0]).toEqual(['course-active']);
  });

  it('derives patient progress strictly from stored visits and adherence', async () => {
    const dataSource = makeDataSource({
      treatment_courses: [
        {
          id: 'course-active',
          patientId: 'patient-1',
          startDate: '2026-09-01',
          initialTargetEndDate: '2027-03-01',
          finalDecision: null,
          finalReviewNote: null,
          finalReviewedAt: null,
          continuedTargetEndDate: null,
          completedAt: null,
          version: 1,
        },
      ],
      control_visits: [
        {
          id: 'v1',
          visitDate: '2026-09-25',
          medicineGiven: true,
          medicationGivenOn: '2026-09-25',
          complaintProgress: 'Membaik',
          additionalNote: null,
        },
      ],
      daily_adherence: [
        {
          date: '2026-09-01',
          confirmedAt: new Date('2026-09-01T00:00:00.000Z'),
        },
      ],
    });
    const settings = makeSettings();
    const service = new PatientDeviceDataService(
      {} as never,
      dataSource as never,
      settings as never,
    );

    const progress = await service.getProgress('patient-1');

    expect(progress.treatment?.id).toBe('course-active');
    expect(progress.visits).toHaveLength(1);
    expect(progress.visits[0].complaintProgress).toBe('Membaik');
    expect(progress.adherence?.totalTaken).toBeGreaterThanOrEqual(1);
  });
});
