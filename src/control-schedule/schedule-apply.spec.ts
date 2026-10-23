import { nextControlDate } from '../common/date-rules';
import { applyMedicationSchedule, resolveNextSchedule } from './schedule-apply';

describe('resolveNextSchedule', () => {
  const today = '2026-10-20';

  it('derives a future Rabu/Sabtu date from the last medication date', () => {
    const lastMedicationDate = '2026-10-15';
    const resolution = resolveNextSchedule(lastMedicationDate, today, 14);
    expect(resolution).toEqual({ status: 'scheduled', date: nextControlDate(lastMedicationDate, 14) });
    expect(resolution.status === 'scheduled' && resolution.date >= today).toBe(true);
  });

  it('asks for confirmation when the medication date is unknown', () => {
    expect(resolveNextSchedule(null, today, 14)).toEqual({
      status: 'perlu_konfirmasi',
      reason: 'data_kurang',
      derivedDate: null,
    });
  });

  it('asks for confirmation instead of storing a date in the past', () => {
    const result = resolveNextSchedule('2026-09-01', today, 14);
    expect(result.status).toBe('perlu_konfirmasi');
    expect(result).toMatchObject({ reason: 'jadwal_lampau', derivedDate: nextControlDate('2026-09-01', 14) });
  });

  it('treats a computed date equal to today as schedulable', () => {
    const derived = nextControlDate('2026-10-06', 14);
    expect(resolveNextSchedule('2026-10-06', derived, 14)).toEqual({ status: 'scheduled', date: derived });
  });
});

describe('applyMedicationSchedule', () => {
  const treatmentId = 'course-1';
  const today = '2026-10-20';

  function managerWith(schedule: unknown) {
    const repository = {
      findOneBy: jest.fn().mockResolvedValue(schedule),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'schedule-1', version: 2, ...value })),
    };
    return { repository, manager: { getRepository: jest.fn(() => repository) } };
  }

  it('creates a future schedule derived only from the medication date', async () => {
    const { repository, manager } = managerWith(null);
    const outcome = await applyMedicationSchedule(manager as never, treatmentId, '2026-10-15', 14, today);
    expect(outcome.status).toBe('scheduled');
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.save.mock.calls[0][0]).toMatchObject({
      treatmentCourseId: treatmentId,
      referenceVisitId: null,
      scheduledDate: nextControlDate('2026-10-15', 14),
    });
  });

  it('updates the existing course schedule in place without creating a duplicate on retry', async () => {
    const existing = {
      id: 'schedule-1',
      treatmentCourseId: treatmentId,
      scheduledDate: '2026-10-24',
      defaultDate: '2026-10-24',
      overriddenByStaffId: null,
      overriddenAt: null,
      version: 2,
    };
    const { repository, manager } = managerWith(existing);

    const outcome = await applyMedicationSchedule(manager as never, treatmentId, '2026-10-15', 14, today);

    expect(outcome).toMatchObject({ status: 'scheduled', change: { scheduleId: 'schedule-1', previousDate: '2026-10-24' } });
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.findOneBy).toHaveBeenCalledWith({ treatmentCourseId: treatmentId });
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.save.mock.calls[0][0]).toMatchObject({
      id: 'schedule-1',
      treatmentCourseId: treatmentId,
      scheduledDate: nextControlDate('2026-10-15', 14),
    });
  });

  it('does not write anything when the derived date is in the past', async () => {
    const { repository, manager } = managerWith(null);
    const outcome = await applyMedicationSchedule(manager as never, treatmentId, '2026-09-01', 14, today);
    expect(outcome).toMatchObject({ status: 'perlu_konfirmasi', reason: 'jadwal_lampau' });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('never overwrites a schedule overridden by staff', async () => {
    const { repository, manager } = managerWith({
      id: 'schedule-1',
      treatmentCourseId: treatmentId,
      scheduledDate: '2026-11-04',
      overriddenByStaffId: 'staff-1',
      version: 3,
    });
    const outcome = await applyMedicationSchedule(manager as never, treatmentId, '2026-10-15', 14, today);
    expect(outcome).toEqual({ status: 'override_dipertahankan' });
    expect(repository.save).not.toHaveBeenCalled();
  });
});
