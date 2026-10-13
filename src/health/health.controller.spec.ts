import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns an ok status and an ISO timestamp', () => {
    const controller = new HealthController();
    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });
});
