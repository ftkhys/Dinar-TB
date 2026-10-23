import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

function controllerWith(query: jest.Mock): HealthController {
  return new HealthController({ query } as never);
}

describe('HealthController', () => {
  it('returns an ok status and an ISO timestamp', () => {
    const controller = controllerWith(jest.fn());
    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });

  it('reports ready when the database answers a lightweight query', async () => {
    const query = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const controller = controllerWith(query);

    await expect(controller.ready()).resolves.toMatchObject({ status: 'ready' });
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns 503 without leaking database details when the check fails', async () => {
    const controller = controllerWith(jest.fn().mockRejectedValue(new Error('password authentication failed for user "postgres"')));

    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(controller.ready()).rejects.toThrow('Database belum siap.');
  });
});
