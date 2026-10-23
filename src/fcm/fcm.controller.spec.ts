import { Test, TestingModule } from '@nestjs/testing';
import { FcmController } from './fcm.controller';
import { FcmService } from './fcm.service';
import { DeviceAuthGuard } from '../auth/device-auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';

describe('FcmController', () => {
  let controller: FcmController;
  let fcmService: jest.Mocked<FcmService>;

  const mockRequest = {
    user: { id: 'device-123', patientId: 'patient-123', kind: 'patient_device', version: 1 },
  } as AuthenticatedRequest;

  beforeEach(async () => {
    const mockFcmService = {
      registerFcmToken: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FcmController],
      providers: [
        { provide: FcmService, useValue: mockFcmService },
      ],
    })
      .overrideGuard(DeviceAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<FcmController>(FcmController);
    fcmService = module.get(FcmService);
  });

  it('should register FCM token successfully', async () => {
    const result = await controller.registerToken(
      { user: mockRequest.user } as AuthenticatedRequest,
      { token: 'fcm-token-123' },
    );

    expect(result).toEqual({ success: true });
    expect(fcmService.registerFcmToken).toHaveBeenCalledWith('device-123', 'fcm-token-123');
  });

  it('should return error when token is missing', async () => {
    const result = await controller.registerToken(
      { user: mockRequest.user } as AuthenticatedRequest,
      { token: '' },
    );

    expect(result).toEqual({ success: false, message: 'Token FCM wajib diisi' });
    expect(fcmService.registerFcmToken).not.toHaveBeenCalled();
  });

  it('should return error when token is not a string', async () => {
    const result = await controller.registerToken(
      { user: mockRequest.user } as AuthenticatedRequest,
      { token: 123 as any },
    );

    expect(result).toEqual({ success: false, message: 'Token FCM wajib diisi' });
    expect(fcmService.registerFcmToken).not.toHaveBeenCalled();
  });
});