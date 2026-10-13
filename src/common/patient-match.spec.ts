import { matchPatientIdentifiers } from './patient-match';

describe('patient identifier matching for imports', () => {
  const existing = [
    { registerNumber: 'REG-01', medicalRecordNumber: 'MR-01' },
    { registerNumber: 'REG-02', medicalRecordNumber: 'MR-02' },
  ];

  it('matches the register and medical record pair without auto-merging', () => {
    expect(matchPatientIdentifiers({ registerNumber: 'REG-01', medicalRecordNumber: 'MR-01' }, existing))
      .toEqual({ kind: 'exact', matches: [0] });
  });

  it('warns when either identifier collides by itself', () => {
    expect(matchPatientIdentifiers({ registerNumber: 'REG-01', medicalRecordNumber: 'MR-99' }, existing).kind)
      .toBe('register_collision');
    expect(matchPatientIdentifiers({ registerNumber: 'REG-99', medicalRecordNumber: 'MR-02' }, existing).kind)
      .toBe('medical_record_collision');
  });

  it('does not identify same-name patients as duplicates', () => {
    expect(matchPatientIdentifiers({ registerNumber: 'REG-03', medicalRecordNumber: 'MR-03' }, existing).kind)
      .toBe('new');
  });
});
