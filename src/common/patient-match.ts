export interface PatientIdentifiers {
  registerNumber: string;
  medicalRecordNumber: string;
}

export type PatientMatch =
  | { kind: 'new' }
  | { kind: 'exact'; matches: number[] }
  | { kind: 'register_collision'; matches: number[] }
  | { kind: 'medical_record_collision'; matches: number[] }
  | { kind: 'both_partial_collision'; matches: number[] };

export function matchPatientIdentifiers<T extends PatientIdentifiers>(
  candidate: PatientIdentifiers,
  existing: T[],
): PatientMatch {
  const register = normalize(candidate.registerNumber);
  const record = normalize(candidate.medicalRecordNumber);
  const registerHits: number[] = [];
  const recordHits: number[] = [];
  const exactHits: number[] = [];
  existing.forEach((patient, index) => {
    const hasRegister = normalize(patient.registerNumber) === register;
    const hasRecord = normalize(patient.medicalRecordNumber) === record;
    if (hasRegister) registerHits.push(index);
    if (hasRecord) recordHits.push(index);
    if (hasRegister && hasRecord) exactHits.push(index);
  });
  if (exactHits.length) return { kind: 'exact', matches: exactHits };
  if (registerHits.length && recordHits.length) {
    return { kind: 'both_partial_collision', matches: [...new Set([...registerHits, ...recordHits])] };
  }
  if (registerHits.length) return { kind: 'register_collision', matches: registerHits };
  if (recordHits.length) return { kind: 'medical_record_collision', matches: recordHits };
  return { kind: 'new' };
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('id-ID');
}
