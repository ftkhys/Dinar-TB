import { ControlScheduleService } from './control-schedule.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

const createMockEventEmitter = () => ({
  emit: jest.fn(),
});

describe('manual initial control schedule', () => {
  it('creates a schedule without a prior medicine-given visit reference', async () => {
    const scheduleRepository = {
      findOneBy: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'schedule-1', version: 1, ...value })),
    };
    const treatmentRepository = { findOneBy: jest.fn().mockResolvedValue({ completedAt: null }) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const eventEmitter = createMockEventEmitter();
    const service = new ControlScheduleService(scheduleRepository as never, treatmentRepository as never, {} as never, audit as never, eventEmitter as never);

    const result = await service.setInitial('course-1', { scheduledDate: '2026-10-10' }, 'staff-1');

    expect(result).toMatchObject({
      treatmentCourseId: 'course-1',
      referenceVisitId: null,
      defaultDate: null,
      scheduledDate: '2026-10-10',
    });
    expect(scheduleRepository.findOneBy).toHaveBeenCalledWith({ treatmentCourseId: 'course-1' });
    expect(scheduleRepository.save).toHaveBeenCalledTimes(1);
    expect(eventEmitter.emit).toHaveBeenCalledWith('schedule.changed', expect.objectContaining({
      treatmentCourseId: 'course-1',
      newDate: '2026-10-10',
      previousDate: null,
      overriddenByStaffId: null,
    }));
  });

  it('rejects creating an initial schedule for a completed treatment', async () => {
    const scheduleRepository = {
      findOneBy: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(),
    };
    const treatmentRepository = { findOneBy: jest.fn().mockResolvedValue({ completedAt: new Date() }) };
    const audit = { record: jest.fn() };
    const eventEmitter = createMockEventEmitter();
    const service = new ControlScheduleService(scheduleRepository as never, treatmentRepository as never, {} as never, audit as never, eventEmitter as never);

    await expect(service.setInitial('course-1', { scheduledDate: '2026-10-10' }, 'staff-1'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(scheduleRepository.save).not.toHaveBeenCalled();
  });

  it('returns not found without attempting to insert a schedule for a missing treatment', async () => {
    const scheduleRepository = {
      findOneBy: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(),
    };
    const treatmentRepository = { findOneBy: jest.fn().mockResolvedValue(null) };
    const audit = { record: jest.fn() };
    const eventEmitter = createMockEventEmitter();
    const service = new ControlScheduleService(scheduleRepository as never, treatmentRepository as never, {} as never, audit as never, eventEmitter as never);

    await expect(service.setInitial('missing-course', { scheduledDate: '2026-10-10' }, 'staff-1'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(scheduleRepository.save).not.toHaveBeenCalled();
  });

  it('rejects overriding a completed treatment without changing its existing schedule', async () => {
    const existingSchedule = {
      id: 'schedule-1', treatmentCourseId: 'course-1', scheduledDate: '2026-10-10',
      version: 1, overriddenByStaffId: null, overriddenAt: null,
    };
    const scheduleRepository = {
      findOneBy: jest.fn().mockResolvedValue(existingSchedule),
      save: jest.fn(),
    };
    const treatmentRepository = { findOneBy: jest.fn().mockResolvedValue({ completedAt: new Date() }) };
    const audit = { record: jest.fn() };
    const eventEmitter = createMockEventEmitter();
    const service = new ControlScheduleService(scheduleRepository as never, treatmentRepository as never, {} as never, audit as never, eventEmitter as never);

    await expect(service.override('course-1', { scheduledDate: '2026-10-14' }, 'staff-1'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(scheduleRepository.save).not.toHaveBeenCalled();
    expect(existingSchedule.scheduledDate).toBe('2026-10-10');
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('managed control schedule list', () => {
  const rows = [
    { scheduleId: 's1', treatmentCourseId: 'c1', patientId: 'p1', patientName: 'Budi', registerNumber: 'R1', address: 'A', scheduledDate: '2026-10-21', completed: false, status: 'Besok' },
    { scheduleId: 's2', treatmentCourseId: 'c2', patientId: 'p2', patientName: 'Ani', registerNumber: 'R2', address: 'B', scheduledDate: '2026-10-24', completed: false, status: 'Mendatang' },
    { scheduleId: 's3', treatmentCourseId: 'c3', patientId: 'p3', patientName: 'Cici', registerNumber: 'R3', address: 'C', scheduledDate: '2026-10-10', completed: true, status: 'Selesai' },
    { scheduleId: null, treatmentCourseId: 'c4', patientId: 'p4', patientName: 'Dedi', registerNumber: 'R4', address: 'D', scheduledDate: null, completed: false, status: 'Perlu Konfirmasi' },
  ];

  function serviceWith(rows: unknown[]) {
    const dataSource = { query: jest.fn()
      .mockResolvedValueOnce([{ total: rows.length, hariIni: 0, besok: 1, terlambat: 0, mendatang: 1, perluKonfirmasi: 1, selesai: 1 }])
      .mockResolvedValueOnce(rows) };
    const service = new ControlScheduleService({} as never, {} as never, dataSource as never, { record: jest.fn() } as never, { emit: jest.fn() } as never);
    return { service, dataSource };
  }

  it('lists every course and derives status, flagging a missing schedule as Perlu Konfirmasi', async () => {
    const { service, dataSource } = serviceWith(rows);
    const today = new Date('2026-10-20T03:00:00.000Z'); // Selasa 20 Okt 2026 WIB

    const list = await service.listManaged(undefined, today);

    expect(list.items.map((item) => item.status)).toEqual(['Besok', 'Mendatang', 'Selesai', 'Perlu Konfirmasi']);
    expect(list.items[0]).toMatchObject({ scheduledDate: '2026-10-21', completed: false });
    expect(list.items[3]).toMatchObject({ scheduleId: null, scheduledDate: null, status: 'Perlu Konfirmasi' });
    expect(list).toMatchObject({ total: 4, page: 1, pageSize: 20, totalPages: 1 });
    expect(dataSource.query).toHaveBeenNthCalledWith(1, expect.stringContaining('FROM treatment_courses tc'), ['2026-10-20', '2026-10-21', null, null]);
    expect(dataSource.query).toHaveBeenNthCalledWith(2, expect.stringContaining('LIMIT $5 OFFSET $6'), ['2026-10-20', '2026-10-21', null, null, 20, 0]);
  });

  it('passes a trimmed search term to the query', async () => {
    const { service, dataSource } = serviceWith([]);
    await service.listManaged('  budi  ', new Date('2026-10-20T03:00:00.000Z'));
    expect(dataSource.query).toHaveBeenNthCalledWith(1, expect.any(String), ['2026-10-20', '2026-10-21', '%budi%', null]);
  });

  it('applies status before total and returns an empty requested page safely', async () => {
    const { service, dataSource } = serviceWith([]);
    const page = await service.listManaged('Budi', new Date('2026-10-20T03:00:00.000Z'), { page: 3, pageSize: 2 }, 'Terlambat');

    expect(page).toMatchObject({ items: [], total: 0, page: 3, pageSize: 2, totalPages: 0 });
    expect(dataSource.query).toHaveBeenNthCalledWith(1, expect.stringContaining("status = $4"), ['2026-10-20', '2026-10-21', '%Budi%', 'Terlambat']);
    expect(dataSource.query).toHaveBeenNthCalledWith(2, expect.stringContaining('WHERE ($4::text IS NULL OR status = $4)'), ['2026-10-20', '2026-10-21', '%Budi%', 'Terlambat', 2, 4]);
  });
});
