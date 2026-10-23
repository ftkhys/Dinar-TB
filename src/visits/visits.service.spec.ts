import { VisitsService } from './visits.service';
import { ControlSchedule } from '../database/entities/control-schedule.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { addCalendarDays, localTodayJakarta, nextControlDate } from '../common/date-rules';

const createMockEventEmitter = () => ({
  emit: jest.fn(),
});

describe('control visit scheduling', () => {
  const treatment = { id: 'course-1', patientId: 'patient-1', completedAt: null };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => audit.record.mockClear());

  function createService(schedule?: Partial<ControlSchedule>, courseCompletedAt: Date | null = null) {
    const scheduleRepository = {
      findOneBy: jest.fn().mockResolvedValue(schedule ?? null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: value.id ?? 'schedule-1', version: 2 })),
    };
    const manager = {
      save: jest.fn(async (value) => ({ ...value, id: 'visit-1' })),
      getRepository: jest.fn((entity) => entity === ControlSchedule ? scheduleRepository : scheduleRepository),
    };
    const dataSource = { transaction: jest.fn((work) => work(manager)) };
    const visits = { create: jest.fn((value) => value), find: jest.fn().mockResolvedValue([]) };
    const treatments = { findOneBy: jest.fn().mockResolvedValue({ ...treatment, completedAt: courseCompletedAt }) };
    const eventEmitter = createMockEventEmitter();
    const settings = { controlIntervalDays: jest.fn().mockResolvedValue(14) };
    const service = new VisitsService(visits as never, scheduleRepository as never, treatments as never, dataSource as never, audit as never, eventEmitter as never, settings as never);
    return { service, scheduleRepository, manager, dataSource, visits };
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

  it('keeps a staff-overridden schedule after medicine is given', async () => {
    const { service, scheduleRepository } = createService({
      id: 'schedule-1', treatmentCourseId: 'course-1', scheduledDate: '2026-11-01',
      referenceVisitId: 'old-visit', defaultDate: '2026-11-01', overriddenByStaffId: 'staff-1',
      overriddenAt: new Date(),
    } as ControlSchedule);
    await service.create('course-1', {
      visitDate: localTodayJakarta(), medicineGiven: true, medicationGivenOn: localTodayJakarta(),
    }, 'staff-1');
    expect(scheduleRepository.save).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'default_recalculated' }));
  });

  it('recalculates the default after medicine is given when not overridden', async () => {
    const { service, scheduleRepository } = createService({
      id: 'schedule-1', treatmentCourseId: 'course-1', scheduledDate: '2026-11-01',
      referenceVisitId: 'old-visit', defaultDate: '2026-11-01', overriddenByStaffId: null, overriddenAt: null,
    } as ControlSchedule);
    const today = localTodayJakarta();
    await service.create('course-1', {
      visitDate: today, medicineGiven: true, medicationGivenOn: today,
    }, 'staff-1');
    const expected = nextControlDate(today, 14);
    expect(scheduleRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      referenceVisitId: 'visit-1', defaultDate: expected, scheduledDate: expected,
    }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'default_recalculated' }));
  });

  it('accepts different visit and medication dates and anchors schedule to medicationGivenOn', async () => {
    const { service, scheduleRepository, manager } = createService();
    const today = localTodayJakarta();
    const visitDate = addCalendarDays(today, -1);
    const result = await service.create('course-1', {
      visitDate, medicineGiven: true, medicationGivenOn: today,
    }, 'staff-1');

    expect(result).toMatchObject({ visitDate, medicationGivenOn: today });
    const expected = nextControlDate(today, 14);
    expect(scheduleRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      referenceVisitId: 'visit-1', defaultDate: expected, scheduledDate: expected,
    }));
    expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({
      visitDate, medicationGivenOn: today,
    }));
  });

  it('anchors the first control schedule when medicine is given on the treatment start date', async () => {
    const { service, scheduleRepository } = createService();
    const today = localTodayJakarta();
    const result = await service.create('course-1', {
      visitDate: today, medicineGiven: true, medicationGivenOn: today,
    }, 'staff-1');

    expect(result).toMatchObject({ visitDate: today, medicationGivenOn: today, medicineGiven: true });
    const expected = nextControlDate(today, 14);
    expect(scheduleRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      treatmentCourseId: 'course-1', referenceVisitId: 'visit-1',
      defaultDate: expected, scheduledDate: expected,
    }));
  });

  it('never stores a past control date when the medication date is old', async () => {
    const { service, scheduleRepository } = createService();
    const today = localTodayJakarta();
    await service.create('course-1', {
      visitDate: addCalendarDays(today, -60), medicineGiven: true, medicationGivenOn: addCalendarDays(today, -60),
    }, 'staff-1');
    expect(scheduleRepository.save).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'default_recalculated' }));
  });

  it('rejects invalid visit or medication calendar dates', async () => {
    const { service, dataSource, scheduleRepository } = createService();
    await expect(service.create('course-1', {
      visitDate: '2026-02-30', medicineGiven: true, medicationGivenOn: '2026-03-01',
    }, 'staff-1')).rejects.toThrow('Tanggal kunjungan bukan tanggal kalender yang valid.');
    await expect(service.create('course-1', {
      visitDate: '2026-02-28', medicineGiven: true, medicationGivenOn: '2026-02-30',
    }, 'staff-1')).rejects.toThrow('Tanggal pemberian obat bukan tanggal kalender yang valid.');
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(scheduleRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a future visit date and a future medication date (WIB)', async () => {
    const { service, dataSource, scheduleRepository } = createService();
    const tomorrow = addCalendarDays(localTodayJakarta(), 1);
    await expect(service.create('course-1', {
      visitDate: tomorrow, medicineGiven: false,
    }, 'staff-1')).rejects.toThrow('Tanggal kunjungan tidak boleh di masa depan.');
    await expect(service.create('course-1', {
      visitDate: localTodayJakarta(), medicineGiven: true, medicationGivenOn: tomorrow,
    }, 'staff-1')).rejects.toThrow('Tanggal pemberian obat tidak boleh di masa depan.');
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(scheduleRepository.save).not.toHaveBeenCalled();
  });

  it('rejects missing medication date and medication date when no medicine was given', async () => {
    const { service, dataSource } = createService();
    await expect(service.create('course-1', {
      visitDate: '2026-10-13', medicineGiven: true,
    }, 'staff-1')).rejects.toThrow('Tanggal pemberian obat harus berformat YYYY-MM-DD.');
    await expect(service.create('course-1', {
      visitDate: '2026-10-13', medicineGiven: false, medicationGivenOn: '2026-10-14',
    }, 'staff-1')).rejects.toThrow('Tanggal pemberian obat hanya berlaku jika obat diberikan.');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects a non-boolean medicineGiven value', async () => {
    const { service, dataSource } = createService();
    await expect(service.create('course-1', {
      visitDate: '2026-10-13', medicineGiven: 'Ya', medicationGivenOn: '2026-10-14',
    }, 'staff-1')).rejects.toThrow('Obat diberikan harus bernilai Ya/Tidak.');
    expect(dataSource.transaction).not.toHaveBeenCalled();
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

  it('scopes visit history to a single patient, newest first', async () => {
    const { service, visits } = createService();

    await service.listByPatient('patient-1');

    expect(visits.find).toHaveBeenCalledWith({
      where: { patientId: 'patient-1' },
      order: { visitDate: 'DESC', createdAt: 'DESC' },
    });
  });

  it('returns the visit rows supplied by the repository unchanged', async () => {
    const { service, visits } = createService();
    const rows = [{ id: 'visit-1', patientId: 'patient-1', visitDate: '2026-10-10' }];
    visits.find.mockResolvedValue(rows);

    await expect(service.listByPatient('patient-1')).resolves.toBe(rows);
  });
});