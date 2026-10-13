import { VisitsService } from './visits.service';
import { ControlSchedule } from '../database/entities/control-schedule.entity';

describe('control visit scheduling', () => {
  const treatment = { id: 'course-1', patientId: 'patient-1', completedAt: null };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => audit.record.mockClear());

  function createService(schedule?: Partial<ControlSchedule>, courseCompletedAt: Date | null = null) {
    const scheduleRepository = {
      findOneBy: jest.fn().mockResolvedValue(schedule ?? null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: value.id ?? 'schedule-1' })),
    };
    const manager = {
      save: jest.fn(async (value) => ({ ...value, id: 'visit-1' })),
      getRepository: jest.fn((entity) => entity === ControlSchedule ? scheduleRepository : scheduleRepository),
    };
    const dataSource = { transaction: jest.fn((work) => work(manager)) };
    const visits = { create: jest.fn((value) => value) };
    const treatments = { findOneBy: jest.fn().mockResolvedValue({ ...treatment, completedAt: courseCompletedAt }) };
    const service = new VisitsService(visits as never, scheduleRepository as never, treatments as never, dataSource as never, audit as never);
    return { service, scheduleRepository, manager, dataSource };
  }

  it('stores a visit without medicine and leaves control schedule untouched', async () => {
    const { service, scheduleRepository } = createService();
    const result = await service.create('course-1', {
      visitDate: '2026-10-10', medicineGiven: false, complaintProgress: 'Perkembangan dicatat',
    }, 'staff-1');
    expect(result.medicineGiven).toBe(false);
    expect(scheduleRepository.findOneBy).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'created', details: 'no_medicine' }));
  });

  it('resets the next control date to the default after medicine is given', async () => {
    const { service, scheduleRepository } = createService({
      id: 'schedule-1', treatmentCourseId: 'course-1', scheduledDate: '2026-11-01',
      referenceVisitId: 'old-visit', defaultDate: '2026-11-01', overriddenByStaffId: 'staff-1',
      overriddenAt: new Date(),
    } as ControlSchedule);
    await service.create('course-1', {
      visitDate: '2026-10-10', medicineGiven: true, medicationGivenOn: '2026-10-10',
    }, 'staff-1');
    expect(scheduleRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      referenceVisitId: 'visit-1', defaultDate: '2026-10-24', scheduledDate: '2026-10-24',
      overriddenByStaffId: null, overriddenAt: null,
    }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'default_recalculated' }));
  });

  it('rejects a medicine date that differs from the visit date', async () => {
    const { service, scheduleRepository } = createService();
    await expect(service.create('course-1', {
      visitDate: '2026-10-13', medicineGiven: true, medicationGivenOn: '2026-10-14',
    }, 'staff-1')).rejects.toThrow('Tanggal pemberian obat harus sama dengan tanggal kunjungan.');
    expect(scheduleRepository.findOneBy).not.toHaveBeenCalled();
    expect(scheduleRepository.save).not.toHaveBeenCalled();
  });

  it('records a visit after treatment completion without updating the active schedule', async () => {
    const { service, scheduleRepository } = createService(undefined, new Date('2026-10-01T00:00:00.000Z'));
    const result = await service.create('course-1', {
      visitDate: '2026-10-10', medicineGiven: true, medicationGivenOn: '2026-10-10',
    }, 'staff-1');

    expect(result.medicineGiven).toBe(true);
    expect(scheduleRepository.findOneBy).not.toHaveBeenCalled();
    expect(scheduleRepository.save).not.toHaveBeenCalled();
  });
});
