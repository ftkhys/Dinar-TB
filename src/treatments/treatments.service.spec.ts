import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TreatmentsService } from './treatments.service';
import { TreatmentDecision } from '../database/enums';
import { ControlSchedule } from '../database/entities/control-schedule.entity';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';
import { addCalendarDays, localTodayJakarta, nextControlDate } from '../common/date-rules';

function createService(options: { hasActiveTreatment?: boolean; schedule?: unknown } = {}) {
  const treatmentRepository = {
    existsBy: jest.fn().mockResolvedValue(options.hasActiveTreatment ?? false),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: unknown) => value),
    findOneBy: jest.fn(async (): Promise<unknown> => null),
  };
  const patientRepository = { findOneBy: jest.fn().mockResolvedValue({ id: 'patient-1', archivedAt: null }) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const eventEmitter = { emit: jest.fn() };
  const settings = { controlIntervalDays: jest.fn(async () => 14) };
  const scheduleRepo = {
    findOneBy: jest.fn(async () => options.schedule ?? null),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: unknown) => ({ id: 'schedule-new', version: 1, ...(value as object) })),
  };
  const manager = {
    save: jest.fn(async (value: unknown) => ({
      id: 'course-new', finalDecision: null, completedAt: null, continuedTargetEndDate: null, ...(value as object),
    })),
    getRepository: jest.fn((entity: unknown) => {
      if (entity === ControlSchedule) return scheduleRepo;
      throw new Error('unexpected entity');
    }),
  };
  const dataSource = { transaction: jest.fn(async (callback: (m: unknown) => unknown) => callback(manager)) };
  const service = new TreatmentsService(
    treatmentRepository as never,
    patientRepository as never,
    dataSource as never,
    audit as never,
    eventEmitter as never,
    settings as never,
  );
  return { service, treatmentRepository, patientRepository, audit, eventEmitter, settings, scheduleRepo, manager };
}

describe('treatment final review', () => {
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  let course: TreatmentCourse;
  let service: TreatmentsService;

  beforeEach(() => {
    course = {
      id: 'course-1', patientId: 'patient-1', startDate: '2026-01-01',
      initialTargetEndDate: '2026-07-01', finalDecision: null, finalReviewNote: null,
      finalReviewedAt: null, continuedTargetEndDate: null, completedAt: null,
    } as TreatmentCourse;
    const treatmentRepository = {
      findOneBy: jest.fn().mockResolvedValue(course),
      save: jest.fn(async (value) => value),
    };
    service = new TreatmentsService(
      treatmentRepository as never, {} as never, {} as never, audit as never, {} as never, {} as never,
    );
    audit.record.mockClear();
  });

  it('closes only after a staff review explicitly selects Selesai', async () => {
    const result = await service.review('course-1', {
      decision: TreatmentDecision.COMPLETED,
      note: 'Tinjauan petugas',
    }, 'staff-1');
    expect(result.finalDecision).toBe(TreatmentDecision.COMPLETED);
    expect(result.completedAt).toBeInstanceOf(Date);
    expect(result.remindersEnabled).toBe(false);
  });

  it('stores the manually entered continuation target and keeps treatment active', async () => {
    const result = await service.review('course-1', {
      decision: TreatmentDecision.CONTINUED,
      note: 'Rencana lanjutan',
      continuedTargetEndDate: '2027-01-17',
    }, 'staff-1');
    expect(result.continuedTargetEndDate).toBe('2027-01-17');
    expect(result.completedAt).toBeNull();
    expect(result.remindersEnabled).toBe(true);
  });

  it('does not allow a final review before entering month six', async () => {
    course.startDate = localTodayJakarta();
    await expect(service.review('course-1', {
      decision: TreatmentDecision.COMPLETED,
      note: 'Terlalu awal',
    }, 'staff-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('exposes the treatment month and eligibility on the staff view', async () => {
    const result = await service.findOne('course-1');
    expect(result.treatmentMonth).toBeGreaterThanOrEqual(6);
    expect(result.finalReviewEligible).toBe(true);
  });

  it('does not allow changing a completed treatment decision', async () => {
    course.finalDecision = TreatmentDecision.COMPLETED;
    course.completedAt = new Date();
    await expect(service.review('course-1', { decision: TreatmentDecision.CONTINUED }, 'staff-1'))
      .rejects.toBeInstanceOf(ConflictException);
  });
});

describe('one active treatment per patient', () => {
  const staffId = 'staff-1';

  it('rejects creating another treatment while the patient has an active one', async () => {
    const { service, treatmentRepository, manager } = createService({ hasActiveTreatment: true });

    await expect(service.create('patient-1', { startDate: '2026-10-01' }, staffId))
      .rejects.toBeInstanceOf(ConflictException);
    expect(treatmentRepository.existsBy).toHaveBeenCalledWith({
      patientId: 'patient-1', completedAt: expect.anything(),
    });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('allows creating a new treatment when previous treatments are completed', async () => {
    const { service, treatmentRepository, manager } = createService({ hasActiveTreatment: false });

    const result = await service.create('patient-1', { startDate: '2026-10-01' }, staffId);

    expect(result.patientId).toBe('patient-1');
    expect(treatmentRepository.existsBy).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledTimes(1);
  });

  it('does not enable reminders before a future treatment start date', async () => {
    const { service } = createService({ hasActiveTreatment: false });
    const tomorrow = addCalendarDays(localTodayJakarta(), 1);

    const result = await service.create('patient-1', { startDate: tomorrow }, staffId);

    expect(result.startDate).toBe(tomorrow);
    expect(result.remindersEnabled).toBe(false);
  });

  it('rejects creating a treatment for a missing or archived patient', async () => {
    const { service, patientRepository } = createService({ hasActiveTreatment: false });
    patientRepository.findOneBy.mockResolvedValue({ id: 'patient-1', archivedAt: new Date() });

    await expect(service.create('patient-1', { startDate: '2026-10-01' }, staffId))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('treatment history dates and next control schedule', () => {
  const staffId = 'staff-1';

  it('derives a future schedule from the last medication date without creating a visit', async () => {
    const { service, scheduleRepo, eventEmitter, settings, audit, manager } = createService();
    const today = localTodayJakarta();
    const startDate = addCalendarDays(today, -30);

    const result = await service.create('patient-1', {
      startDate,
      lastControlDate: today,
      lastMedicationDate: today,
    }, staffId);

    expect(result.lastControlDate).toBe(today);
    expect(result.lastMedicationDate).toBe(today);
    expect(result.schedulePendingConfirmation).toBe(false);
    expect(settings.controlIntervalDays).toHaveBeenCalledTimes(1);
    expect(scheduleRepo.save).toHaveBeenCalledTimes(1);
    expect(manager.getRepository).toHaveBeenCalledWith(ControlSchedule);
    expect(scheduleRepo.save.mock.calls[0][0]).toMatchObject({
      scheduledDate: nextControlDate(today, 14),
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith('schedule.changed', expect.objectContaining({
      treatmentCourseId: 'course-new',
      previousDate: null,
      newDate: expect.any(String),
    }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      objectType: 'control_schedule', action: 'default_recalculated',
    }));
  });

  it('flags confirmation instead of storing a schedule already in the past', async () => {
    const { service, scheduleRepo, eventEmitter, settings, audit } = createService();
    const today = localTodayJakarta();

    const result = await service.create('patient-1', {
      startDate: addCalendarDays(today, -90),
      lastControlDate: addCalendarDays(today, -50),
      lastMedicationDate: addCalendarDays(today, -60),
    }, staffId);

    expect(result.schedulePendingConfirmation).toBe(true);
    expect(settings.controlIntervalDays).toHaveBeenCalledTimes(1);
    expect(scheduleRepo.save).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalledWith('schedule.changed', expect.anything());
    expect(audit.record).not.toHaveBeenCalledWith(expect.objectContaining({ objectType: 'control_schedule' }));
  });

  it('does not derive a schedule when no medication date is provided', async () => {
    const { service, scheduleRepo, settings } = createService();

    await service.create('patient-1', { startDate: '2025-01-01', lastControlDate: '2025-06-01' }, staffId);

    expect(settings.controlIntervalDays).not.toHaveBeenCalled();
    expect(scheduleRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a control date before the treatment start', async () => {
    const { service, manager } = createService();

    await expect(service.create('patient-1', {
      startDate: '2025-06-01',
      lastControlDate: '2025-01-01',
    }, staffId)).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects a medication date without a control date', async () => {
    const { service } = createService();

    await expect(service.create('patient-1', {
      startDate: '2025-01-01',
      lastMedicationDate: '2025-05-20',
    }, staffId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a medication date after the control date', async () => {
    const { service } = createService();

    await expect(service.create('patient-1', {
      startDate: '2025-01-01',
      lastControlDate: '2025-05-01',
      lastMedicationDate: '2025-05-20',
    }, staffId)).rejects.toBeInstanceOf(BadRequestException);
  });
});
