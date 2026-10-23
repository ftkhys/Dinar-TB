import { Test, TestingModule } from '@nestjs/testing';
import { FcmService } from './fcm.service';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { ScheduleChangedEvent } from '../control-schedule/control-schedule.service';

describe('FcmService', () => {
  let service: FcmService;
  let configService: jest.Mocked<ConfigService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn(),
    };

    const mockEventEmitter = {
      on: jest.fn(),
    };

    const mockDataSource = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FcmService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<FcmService>(FcmService);
    configService = module.get(ConfigService);
    eventEmitter = module.get(EventEmitter2);
    dataSource = module.get(DataSource);
  });

  describe('onModuleInit', () => {
    it('should warn when Firebase credentials not configured', async () => {
      configService.get.mockReturnValue(undefined);
      await service.onModuleInit();
      // Should not throw, just log warning
    });
  });

  describe('registerFcmToken', () => {
    it('should update FCM token for device', async () => {
      dataSource.query.mockResolvedValueOnce({ affected: 1 });

      await (service as any).registerFcmToken('device-123', 'fcm-token-123');

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE patient_devices SET fcm_token = $1'),
        ['fcm-token-123', 'device-123'],
      );
    });
  });

  describe('getFcmTokenForPatient', () => {
    it('should return FCM token for patient with active treatment', async () => {
      dataSource.query.mockResolvedValueOnce([{ fcm_token: 'fcm-token-123' }]);

      const token = await (service as any).getFcmTokenForPatient('treatment-123');

      expect(token).toBe('fcm-token-123');
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM patient_devices pd'),
        ['treatment-123'],
      );
    });

    it('should return null when no token found', async () => {
      dataSource.query.mockResolvedValueOnce([]);

      const token = await (service as any).getFcmTokenForPatient('treatment-123');

      expect(token).toBeNull();
    });
  });

  describe('sendScheduleChangeNotification', () => {
    it('should skip when FCM not initialized', async () => {
      // Service initialized without Firebase credentials
      const event = {
        treatmentCourseId: 'treatment-123',
        scheduleId: 'schedule-123',
        previousDate: '2026-10-10',
        newDate: '2026-10-15',
        overriddenByStaffId: 'staff-1',
        version: 2,
        changedAt: new Date(),
      };

      // Should not throw
      await (service as any).sendScheduleChangeNotification(event);
    });
  });

  describe('handleSendError', () => {
    it('should not throw on any error', async () => {
      const error = new Error('Network error');
      dataSource.query.mockResolvedValueOnce({ affected: 1 });

      await expect((service as any).handleSendError(error, 'treatment-123')).resolves.not.toThrow();
    });

    it('should not throw on invalid registration token error', async () => {
      const error = { code: 'messaging/invalid-registration-token', message: 'Invalid token' };
      dataSource.query.mockResolvedValueOnce({ affected: 1 });

      await expect((service as any).handleSendError(error, 'treatment-123')).resolves.not.toThrow();
    });

    it('should log to audit on send failure', async () => {
      const error = new Error('Network error');
      dataSource.query.mockResolvedValueOnce({ affected: 1 });

      await (service as any).handleSendError(error, 'treatment-123');

      // Verify audit log was called
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        expect.arrayContaining(['treatment-123', 'Network error']),
      );
    });
  });
});