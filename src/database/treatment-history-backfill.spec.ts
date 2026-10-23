import { buildHistoryPatch, TreatmentHistoryCandidate } from './treatment-history-backfill';

function candidate(overrides: Partial<TreatmentHistoryCandidate> = {}): TreatmentHistoryCandidate {
  return {
    treatmentId: 'course-1',
    startDate: '2025-01-01',
    lastControlDate: null,
    lastMedicationDate: null,
    existingControlDate: null,
    existingMedicationDate: null,
    ...overrides,
  };
}

describe('buildHistoryPatch', () => {
  it('fills both columns when they are NULL and real visits exist', () => {
    const patch = buildHistoryPatch(candidate({
      lastControlDate: '2025-06-01',
      lastMedicationDate: '2025-05-20',
    }));
    expect(patch).toEqual({ lastControlDate: '2025-06-01', lastMedicationDate: '2025-05-20' });
  });

  it('never overwrites a manually stored control date', () => {
    const patch = buildHistoryPatch(candidate({
      lastControlDate: '2025-06-01',
      lastMedicationDate: '2025-05-20',
      existingControlDate: '2025-06-10',
    }));
    expect(patch).toEqual({ lastMedicationDate: '2025-05-20' });
    expect(patch.lastControlDate).toBeUndefined();
  });

  it('never overwrites a manually stored medication date', () => {
    const patch = buildHistoryPatch(candidate({
      lastControlDate: '2025-06-01',
      lastMedicationDate: '2025-05-20',
      existingMedicationDate: '2025-05-25',
    }));
    expect(patch).toEqual({ lastControlDate: '2025-06-01' });
  });

  it('never infers a medication date from a control date', () => {
    const patch = buildHistoryPatch(candidate({
      lastControlDate: '2025-06-01',
      lastMedicationDate: null,
    }));
    expect(patch).toEqual({ lastControlDate: '2025-06-01' });
    expect(patch.lastMedicationDate).toBeUndefined();
  });

  it('writes nothing when there is no visit history', () => {
    expect(buildHistoryPatch(candidate())).toEqual({});
  });

  it('writes nothing when both columns already hold values', () => {
    const patch = buildHistoryPatch(candidate({
      lastControlDate: '2025-06-01',
      lastMedicationDate: '2025-05-20',
      existingControlDate: '2025-06-10',
      existingMedicationDate: '2025-05-25',
    }));
    expect(patch).toEqual({});
  });
});
