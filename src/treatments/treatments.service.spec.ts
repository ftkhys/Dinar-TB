import { ConflictException } from '@nestjs/common';
import { TreatmentsService } from './treatments.service';
import { TreatmentDecision } from '../database/enums';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';

describe('treatment final review', () => {
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  let course: TreatmentCourse;
  let service: TreatmentsService;

  beforeEach(() => {
    course = {
      id: 'course-1', patientId: 'patient-1', finalDecision: null, finalReviewNote: null,
      finalReviewedAt: null, continuedTargetEndDate: null, completedAt: null,
    } as TreatmentCourse;
    const treatmentRepository = {
      findOneBy: jest.fn().mockResolvedValue(course),
      save: jest.fn(async (value) => value),
    };
    service = new TreatmentsService(treatmentRepository as never, {} as never, audit as never);
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

  it('does not allow changing a completed treatment decision', async () => {
    course.finalDecision = TreatmentDecision.COMPLETED;
    course.completedAt = new Date();
    await expect(service.review('course-1', { decision: TreatmentDecision.CONTINUED }, 'staff-1'))
      .rejects.toBeInstanceOf(ConflictException);
  });
});

describe('one active treatment per patient', () => {
  const staffId = 'staff-1';

  function createService(hasActiveTreatment: boolean) {
    const treatmentRepository = {
      existsBy: jest.fn().mockResolvedValue(hasActiveTreatment),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({
        id: 'course-new', finalDecision: null, completedAt: null,
        continuedTargetEndDate: null, ...value,
      })),
    };
    const patientRepository = { existsBy: jest.fn().mockResolvedValue(true) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    return {
      service: new TreatmentsService(treatmentRepository as never, patientRepository as never, audit as never),
      treatmentRepository,
      patientRepository,
    };
  }

  it('rejects creating another treatment while the patient has an active one', async () => {
    const { service, treatmentRepository } = createService(true);

    await expect(service.create('patient-1', { startDate: '2026-10-01' }, staffId))
      .rejects.toBeInstanceOf(ConflictException);
    expect(treatmentRepository.existsBy).toHaveBeenCalledWith({
      patientId: 'patient-1', completedAt: expect.anything(),
    });
    expect(treatmentRepository.save).not.toHaveBeenCalled();
  });

  it('allows creating a new treatment when previous treatments are completed', async () => {
    const { service, treatmentRepository } = createService(false);

    const result = await service.create('patient-1', { startDate: '2026-10-01' }, staffId);

    expect(result.patientId).toBe('patient-1');
    expect(treatmentRepository.existsBy).toHaveBeenCalledTimes(1);
    expect(treatmentRepository.save).toHaveBeenCalledTimes(1);
  });
});
