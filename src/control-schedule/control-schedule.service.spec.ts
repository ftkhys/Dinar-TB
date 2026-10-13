import { ControlScheduleService } from './control-schedule.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('manual initial control schedule', () => {
  it('creates a schedule without a prior medicine-given visit reference', async () => {
    const scheduleRepository = {
      findOneBy: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'schedule-1', ...value })),
    };
    const treatmentRepository = { findOneBy: jest.fn().mockResolvedValue({ completedAt: null }) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ControlScheduleService(scheduleRepository as never, treatmentRepository as never, audit as never);

    const result = await service.setInitial('course-1', { scheduledDate: '2026-10-10' }, 'staff-1');

    expect(result).toMatchObject({
      treatmentCourseId: 'course-1',
      referenceVisitId: null,
      defaultDate: null,
      scheduledDate: '2026-10-10',
    });
    expect(scheduleRepository.findOneBy).toHaveBeenCalledWith({ treatmentCourseId: 'course-1' });
    expect(scheduleRepository.save).toHaveBeenCalledTimes(1);
  });

  it('rejects creating an initial schedule for a completed treatment', async () => {
    const scheduleRepository = {
      findOneBy: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(),
    };
    const treatmentRepository = { findOneBy: jest.fn().mockResolvedValue({ completedAt: new Date() }) };
    const audit = { record: jest.fn() };
    const service = new ControlScheduleService(scheduleRepository as never, treatmentRepository as never, audit as never);

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
    const service = new ControlScheduleService(scheduleRepository as never, treatmentRepository as never, audit as never);

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
    const service = new ControlScheduleService(scheduleRepository as never, treatmentRepository as never, audit as never);

    await expect(service.override('course-1', { scheduledDate: '2026-10-14' }, 'staff-1'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(scheduleRepository.save).not.toHaveBeenCalled();
    expect(existingSchedule.scheduledDate).toBe('2026-10-10');
    expect(audit.record).not.toHaveBeenCalled();
  });
});
