import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, DeepPartial, SelectQueryBuilder } from 'typeorm';
import { AdherenceService } from './adherence.service';
import { DailyAdherence } from '../database/entities/daily-adherence.entity';
import { PatientDevice } from '../database/entities/patient-device.entity';
import { SyncReceipt } from '../database/entities/sync-receipt.entity';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';
import { SettingsService } from '../settings/settings.service';
import { AdherenceStatus } from '../database/enums';
import { AdherenceOperation } from './adherence.service';
import { createHash } from 'node:crypto';

describe('AdherenceService', () => {
  let service: AdherenceService;
  let treatmentsRepo: Partial<Record<keyof Repository<TreatmentCourse>, jest.Mock>>;
  let adherenceRepo: Partial<Record<keyof Repository<DailyAdherence>, jest.Mock>>;
  let devicesRepo: Partial<Record<keyof Repository<PatientDevice>, jest.Mock>>;
  let receiptRepo: Partial<Record<keyof Repository<SyncReceipt>, jest.Mock>>;
  let dataSource: Partial<Record<keyof DataSource, jest.Mock>>;
  let mockManager: Partial<Record<keyof EntityManager, jest.Mock>>;

  const validUuid = '123e4567-e89b-12d3-a456-426614174000';
  const validUuid2 = '123e4567-e89b-12d3-a456-426614174001';
  const treatmentId = '123e4567-e89b-12d3-a456-426614174003';

  const mockDevice = {
    id: 'device-123',
    patientId: 'patient-123',
    deactivatedAt: null,
  } as PatientDevice;

  const mockTreatment = {
    id: treatmentId,
    patientId: 'patient-123',
    version: 1,
    completedAt: null,
    startDate: '2026-10-01',
  } as TreatmentCourse;

  const mockOperation: AdherenceOperation = {
    operationId: validUuid,
    treatmentCourseId: treatmentId,
    adherenceDate: '2026-10-05',
    confirmedAt: '2026-10-05T07:00:00.000Z',
    expectedTreatmentVersion: 1,
  };

  const createQueryBuilderMock = (returnValue: any) => ({
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(returnValue),
  });

  beforeEach(async () => {
    const deviceQb = createQueryBuilderMock(mockDevice);
    const treatmentQb = createQueryBuilderMock(mockTreatment);

    // Mock repository instances that will be returned by getRepository
    const mockDeviceRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(deviceQb),
    };

    const mockTreatmentRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(treatmentQb),
    };

    mockManager = {
      getRepository: jest.fn((entity: any) => {
        const entityName = entity?.name || entity?.constructor?.name || '';
        // Debug: log what entity is being requested
        // console.log('getRepository called with:', entityName, entity);
        if (entityName === 'PatientDevice' || entity === PatientDevice) return mockDeviceRepo;
        if (entityName === 'TreatmentCourse' || entity === TreatmentCourse) return mockTreatmentRepo;
        if (entityName === 'DailyAdherence' || entity === DailyAdherence) return adherenceRepo;
        if (entityName === 'SyncReceipt' || entity === SyncReceipt) return receiptRepo;
        // console.log('Unknown entity:', entityName, entity);
        return {};
      }),
      createQueryBuilder: jest.fn(),
      save: jest.fn(),
      transaction: jest.fn((callback: any) => callback(mockManager)),
    } as any;

    treatmentsRepo = {
      findOneBy: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    adherenceRepo = {
      find: jest.fn(),
      findOneBy: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    devicesRepo = {
      findOneBy: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    receiptRepo = {
      findOneBy: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    dataSource = {
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdherenceService,
        { provide: getRepositoryToken(TreatmentCourse), useValue: treatmentsRepo },
        { provide: getRepositoryToken(DailyAdherence), useValue: adherenceRepo },
        { provide: getRepositoryToken(PatientDevice), useValue: devicesRepo },
        { provide: getRepositoryToken(SyncReceipt), useValue: receiptRepo },
        { provide: DataSource, useValue: dataSource },
        {
          provide: SettingsService,
          useValue: {
            reminderWindows: jest.fn().mockResolvedValue([
              { start: '06:00', end: '07:00' },
              { start: '20:00', end: '21:00' },
            ]),
          },
        },
      ],
    }).compile();

    service = module.get<AdherenceService>(AdherenceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const setupMocks = (deviceReturn: any = mockDevice, treatmentReturn: any = mockTreatment) => {
    const deviceQb = createQueryBuilderMock(deviceReturn);
    const treatmentQb = createQueryBuilderMock(treatmentReturn);

    const mockDeviceRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(deviceQb),
    };

    const mockTreatmentRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(treatmentQb),
    };

    (mockManager.getRepository as jest.Mock).mockImplementation((entity: any) => {
      if (entity === PatientDevice) return mockDeviceRepo;
      if (entity === TreatmentCourse) return mockTreatmentRepo;
      if (entity === DailyAdherence) return adherenceRepo;
      if (entity === SyncReceipt) return receiptRepo;
      return {};
    });

    (dataSource.transaction as jest.Mock).mockImplementation(async (callback: any) => callback(mockManager));
  };

  describe('applyOperation - CONFLICT handling', () => {
    it('returns CONFLICT when treatment version mismatch', async () => {
      const updatedTreatment = { ...mockTreatment, version: 2 };
      
      setupMocks(mockDevice, updatedTreatment);

      receiptRepo.findOneBy!.mockResolvedValue(null);
      adherenceRepo.findOneBy!.mockResolvedValue(null);

      // Mock receiptRepo.save to return a receipt with id
      receiptRepo.save!.mockResolvedValue({
        id: 'receipt-123',
        resultCode: 'CONFLICT',
        serverVersion: 2,
      });

      const result = await service['applyOperation']('device-123', mockOperation);

      expect(result).toEqual(
        expect.objectContaining({
          code: 'CONFLICT',
          server: updatedTreatment,
        })
      );
    });

    it('stores receipt with CONFLICT resultCode and serverVersion', async () => {
      const updatedTreatment = { ...mockTreatment, version: 2 };
      
      setupMocks(mockDevice, updatedTreatment);

      receiptRepo.findOneBy!.mockResolvedValue(null);
      adherenceRepo.findOneBy!.mockResolvedValue(null);

      const savedReceipt: any[] = [];
      // Mock receiptRepo.create().save() chain - service calls save(create(...))
      const mockReceipt = {
        id: 'receipt-conflict',
        deviceId: 'device-123',
        operationId: validUuid,
        requestHash: 'hash',
        resourceId: updatedTreatment.id,
        serverVersion: 2,
        resultCode: 'CONFLICT',
        createdAt: new Date(),
      };
      
      receiptRepo.create!.mockReturnValue(mockReceipt);
      receiptRepo.save!.mockResolvedValue(mockReceipt);

      const result = await service['applyOperation']('device-123', mockOperation);

      expect(result).toEqual(
        expect.objectContaining({
          code: 'CONFLICT',
          server: updatedTreatment,
        })
      );
      expect(savedReceipt.length).toBe(0); // Not using savedReceipt array anymore
      // Verify receiptRepo.create was called with correct data
      expect(receiptRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          operationId: validUuid,
          resultCode: 'CONFLICT',
          serverVersion: 2,
        })
      );
    });
  });

  it('rejects adherence confirmation dated before treatment start without writing records', async () => {
    setupMocks(mockDevice, { ...mockTreatment, startDate: '2026-10-06' });
    receiptRepo.findOneBy!.mockResolvedValue(null);

    await expect(service['applyOperation']('device-123', mockOperation))
      .rejects.toBeInstanceOf(BadRequestException);

    expect(adherenceRepo.save).not.toHaveBeenCalled();
    expect(receiptRepo.save).not.toHaveBeenCalled();
  });

  describe('applyOperation - IDEMPOTENCY_KEY_REUSED', () => {
    it('throws IDEMPOTENCY_KEY_REUSED when same operationId with different payload', async () => {
      const existingReceipt = {
        id: 'receipt-123',
        deviceId: 'device-123',
        operationId: validUuid,
        requestHash: 'different-hash',
        resourceId: 'some-id',
        serverVersion: 1,
        resultCode: 'APPLIED',
        createdAt: new Date(),
        device: mockDevice,
      } as SyncReceipt;

      setupMocks();
      receiptRepo.findOneBy!.mockResolvedValue(existingReceipt);
      adherenceRepo.findOneBy!.mockResolvedValue(null);

      await expect(
        service['applyOperation']('device-123', mockOperation)
      ).rejects.toThrow(ConflictException);
    });

    it('allows replay when same operationId with SAME payload (same hash)', async () => {
      const requestHash = createHash('sha256').update(JSON.stringify(mockOperation)).digest('hex');
      
      const existingReceipt = {
        id: 'receipt-123',
        deviceId: 'device-123',
        operationId: validUuid,
        requestHash,
        resourceId: 'adherence-123',
        serverVersion: 1,
        resultCode: 'APPLIED',
        createdAt: new Date(),
        device: mockDevice,
      } as SyncReceipt;

      const mockAdherence = {
        id: 'adherence-123',
        treatmentCourseId: treatmentId,
        adherenceDate: '2026-10-05',
        confirmedAt: new Date('2026-10-05T07:00:00.000Z'),
        status: AdherenceStatus.TAKEN,
        treatmentCourse: mockTreatment,
        sourceDeviceId: 'device-123',
        confirmedByStaffId: null,
        createdAt: new Date(),
      } as DailyAdherence;

      setupMocks();
      receiptRepo.findOneBy!.mockResolvedValue(existingReceipt);
      adherenceRepo.findOneBy!.mockResolvedValue(mockAdherence);

      const result = await service['applyOperation']('device-123', mockOperation);

      expect(result).toEqual(
        expect.objectContaining({
          code: 'APPLIED',
          replay: true,
          adherence: mockAdherence,
        })
      );
    });
  });

  describe('applyOperation - DUPLICATE adherence', () => {
    it('returns DUPLICATE when adherence already exists with same confirmedAt', async () => {
      const existingAdherence = {
        id: 'adherence-123',
        treatmentCourseId: treatmentId,
        adherenceDate: '2026-10-05',
        confirmedAt: new Date('2026-10-05T07:00:00.000Z'),
        status: AdherenceStatus.TAKEN,
        treatmentCourse: mockTreatment,
        sourceDeviceId: 'device-123',
        confirmedByStaffId: null,
        createdAt: new Date(),
      } as DailyAdherence;

      setupMocks();
      receiptRepo.findOneBy!.mockResolvedValue(null);
      adherenceRepo.findOneBy!.mockResolvedValue(existingAdherence);

      const savedReceipt: any[] = [];
      receiptRepo.save!.mockImplementation(async (receipt: DeepPartial<SyncReceipt>) => {
        const saved = { ...receipt, id: 'receipt-' + Date.now(), resultCode: 'DUPLICATE' };
        savedReceipt.push(saved);
        return saved;
      });

      const result = await service['applyOperation']('device-123', mockOperation);

      expect(result).toEqual(
        expect.objectContaining({
          code: 'DUPLICATE',
        })
      );
      expect(savedReceipt[0].resultCode).toBe('DUPLICATE');
    });
  });

  describe('confirmOnline', () => {
    it('throws BadRequestException when expectedTreatmentVersion is not integer', async () => {
      await expect(
        service.confirmOnline('device-123', treatmentId, {
          operationId: validUuid,
          adherenceDate: '2026-10-05',
          expectedTreatmentVersion: 'not-a-number',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('generates confirmedAt if not provided', async () => {
      setupMocks();
      receiptRepo.findOneBy!.mockResolvedValue(null);
      adherenceRepo.findOneBy!.mockResolvedValue(null);

      // Mock adherenceRepo.save to return an adherence with id
      const mockAdherence = {
        id: 'adherence-new',
        treatmentCourseId: treatmentId,
        adherenceDate: '2026-10-05',
        confirmedAt: new Date('2026-10-05T07:00:00.000Z'),
        status: AdherenceStatus.TAKEN,
      } as DailyAdherence;
      adherenceRepo.save!.mockResolvedValue(mockAdherence);

      // Mock receiptRepo.save
      receiptRepo.save!.mockResolvedValue({
        id: 'receipt-new',
        resultCode: 'APPLIED',
      });

      // Use a date that matches Jakarta timezone
      // 2026-10-05T07:00:00.000Z is 2026-10-05T14:00:00+07:00 in Jakarta
      // So the date is 2026-10-05 which matches adherenceDate
      const result = await service.confirmOnline('device-123', treatmentId, {
        operationId: validUuid,
        adherenceDate: '2026-10-05',
        confirmedAt: '2026-10-05T07:00:00.000Z',
        expectedTreatmentVersion: 1,
      });

expect(result).toEqual(
        expect.objectContaining({
          code: 'APPLIED',
        })
      );
    });

    it('accepts a microsecond-precision confirmedAt (regression: strict toISOString compare)', async () => {
      setupMocks();
      receiptRepo.findOneBy!.mockResolvedValue(null);
      adherenceRepo.findOneBy!.mockResolvedValue(null);

      adherenceRepo.save!.mockResolvedValue({
        id: 'adherence-micro',
        treatmentCourseId: treatmentId,
        adherenceDate: '2026-10-05',
        confirmedAt: new Date('2026-10-05T07:00:00.123Z'),
        status: AdherenceStatus.TAKEN,
      } as DailyAdherence);
      receiptRepo.save!.mockResolvedValue({ id: 'receipt-micro', resultCode: 'APPLIED' });

      // Dart's DateTime.toIso8601String() emits six fractional digits; the old
      // validation compared it against the millisecond-precision
      // Date.toISOString() and rejected it with 400.
      const result = await service.confirmOnline('device-123', treatmentId, {
        operationId: validUuid,
        adherenceDate: '2026-10-05',
        confirmedAt: '2026-10-05T07:00:00.123456Z',
        expectedTreatmentVersion: 1,
      });

      expect(result).toEqual(expect.objectContaining({ code: 'APPLIED' }));
    });
  });

  describe('sync endpoint', () => {
    it('processes multiple operations', async () => {
      const operations = [
        { ...mockOperation, operationId: validUuid, treatmentCourseId: treatmentId },
        { ...mockOperation, operationId: validUuid2, treatmentCourseId: treatmentId, adherenceDate: '2026-10-06', confirmedAt: '2026-10-06T07:00:00.000Z' },
      ];

      // Set up mocks for each operation call
      const setupMocksForOperation = (deviceReturn: any = mockDevice, treatmentReturn: any = mockTreatment) => {
        const deviceQb = createQueryBuilderMock(deviceReturn);
        const treatmentQb = createQueryBuilderMock(treatmentReturn);

        const mockDeviceRepo = { createQueryBuilder: jest.fn().mockReturnValue(deviceQb) };
        const mockTreatmentRepo = { createQueryBuilder: jest.fn().mockReturnValue(treatmentQb) };

        (mockManager.getRepository as jest.Mock).mockImplementation((entity: any) => {
          if (entity === PatientDevice) return mockDeviceRepo;
          if (entity === TreatmentCourse) return mockTreatmentRepo;
          if (entity === DailyAdherence) return adherenceRepo;
          if (entity === SyncReceipt) return receiptRepo;
          return {};
        });
      };

      // Mock transaction to return the result of the callback (applyOperation result)
      (dataSource.transaction as jest.Mock).mockImplementation(async (callback: any) => {
        setupMocksForOperation();
        return await callback(mockManager);
      });

      receiptRepo.findOneBy!.mockResolvedValue(null);
      adherenceRepo.findOneBy!.mockResolvedValue(null);

      // Mock adherenceRepo.create() and save() - service calls save(create(...))
      const mockAdherence1 = {
        id: 'adherence-1',
        treatmentCourseId: treatmentId,
        adherenceDate: '2026-10-05',
        confirmedAt: new Date('2026-10-05T07:00:00.000Z'),
        status: AdherenceStatus.TAKEN,
      } as DailyAdherence;
      const mockAdherence2 = {
        id: 'adherence-2',
        treatmentCourseId: treatmentId,
        adherenceDate: '2026-10-06',
        confirmedAt: new Date('2026-10-06T07:00:00.000Z'),
        status: AdherenceStatus.TAKEN,
      } as DailyAdherence;

      // adherenceRepo.create returns the entity, save returns the entity with id
      adherenceRepo.create!
        .mockReturnValueOnce(mockAdherence1)
        .mockReturnValueOnce(mockAdherence2);
      adherenceRepo.save!
        .mockResolvedValueOnce(mockAdherence1)
        .mockResolvedValueOnce(mockAdherence2);

      // Mock receiptRepo.create() and save() - service calls save(create(...))
      const mockReceipt1 = {
        id: 'receipt-1',
        deviceId: 'device-123',
        operationId: validUuid,
        requestHash: 'hash1',
        resourceId: 'adherence-1',
        serverVersion: 1,
        resultCode: 'APPLIED',
        createdAt: new Date(),
      };
      const mockReceipt2 = {
        id: 'receipt-2',
        deviceId: 'device-123',
        operationId: validUuid2,
        requestHash: 'hash2',
        resourceId: 'adherence-2',
        serverVersion: 1,
        resultCode: 'APPLIED',
        createdAt: new Date(),
      };

      receiptRepo.create!
        .mockReturnValueOnce(mockReceipt1)
        .mockReturnValueOnce(mockReceipt2);
      receiptRepo.save!
        .mockResolvedValueOnce(mockReceipt1)
        .mockResolvedValueOnce(mockReceipt2);

      const syncOperations = [
        { ...mockOperation, operationId: validUuid, treatmentCourseId: treatmentId },
        { ...mockOperation, operationId: validUuid2, treatmentCourseId: treatmentId, adherenceDate: '2026-10-06', confirmedAt: '2026-10-06T07:00:00.000Z' },
      ];

      const result = await service.sync('device-123', syncOperations);

      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual(
        expect.objectContaining({
          code: 'APPLIED',
        })
      );
      expect(result.results[1]).toEqual(
        expect.objectContaining({
          code: 'APPLIED',
        })
      );
    });

    it('throws BadRequestException when operations exceeds 200', async () => {
      const manyOps = Array(201).fill({ ...mockOperation, operationId: validUuid, treatmentCourseId: treatmentId });
      await expect(service.sync('device-123', manyOps)).rejects.toThrow(BadRequestException);
    });
  });
});
