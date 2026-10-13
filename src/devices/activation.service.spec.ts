import { ACTIVATION_CODE_VALIDITY_MS, isUuid } from './activation.service';

describe('patient activation requirements', () => {
  it('uses a single-use code validity window of exactly 24 hours', () => {
    expect(ACTIVATION_CODE_VALIDITY_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('accepts UUID device identifiers and rejects non-UUID identifiers', () => {
    expect(isUuid('d7b5c1da-60d4-47f3-9786-6162e9714e53')).toBe(true);
    expect(isUuid('patient-1')).toBe(false);
  });
});
