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

export function normalizeIdentity(value: string): string {
  return normalize(value);
}

/** Minimal surface of a TypeORM `QueryRunner`/`DataSource`/`EntityManager`. */
export type IdentityQueryable = (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;

/**
 * DB-backed identity check. Compares on a normalized form (trimmed,
 * case-insensitive) so `" rm-1 "` and `"RM-1"` are treated as the same
 * identifier. The unique indexes added by the identity migration make this
 * check race-safe; this query is the friendly pre-check that returns a clear
 * 409 before the save hits the constraint.
 */
export async function findIdentityConflict(
  query: IdentityQueryable,
  candidate: PatientIdentifiers,
  excludeId?: string | null,
): Promise<{ kind: IdentityConflictKind; id: string } | null> {
  const [row] = await query(
    `SELECT id, register_number AS "registerNumber", medical_record_number AS "medicalRecordNumber"
       FROM patients
      WHERE (lower(btrim(register_number)) = $1 OR lower(btrim(medical_record_number)) = $2)
        AND ($3::uuid IS NULL OR id <> $3::uuid)
      LIMIT 1`,
    [normalizeIdentity(candidate.registerNumber), normalizeIdentity(candidate.medicalRecordNumber), excludeId ?? null],
  );
  if (!row) return null;
  const kind = identityConflictKind(candidate, {
    registerNumber: String(row.registerNumber),
    medicalRecordNumber: String(row.medicalRecordNumber),
  });
  return kind ? { kind, id: String(row.id) } : null;
}

export function identityConflictMessage(kind: IdentityConflictKind): string {
  if (kind === 'register') return 'Nomor Register Pasien sudah digunakan pasien lain.';
  if (kind === 'medical_record') return 'Nomor Rekam Medis sudah digunakan pasien lain.';
  return 'Nomor Register Pasien dan Nomor Rekam Medis sudah digunakan pasien lain.';
}

export type IdentityConflictKind = 'register' | 'medical_record' | 'both';

/**
 * Decides which identifier(s) of a candidate collide with an existing patient.
 * `patient-match.ts` is the single source of truth for identity normalization,
 * so the DB-backed checks in the services stay consistent with this policy.
 */
export function identityConflictKind(
  candidate: PatientIdentifiers,
  existing: PatientIdentifiers,
): IdentityConflictKind | null {
  const match = matchPatientIdentifiers(candidate, [existing]);
  if (match.kind === 'new') return null;
  const register = normalize(candidate.registerNumber) === normalize(existing.registerNumber);
  const record = normalize(candidate.medicalRecordNumber) === normalize(existing.medicalRecordNumber);
  if (register && record) return 'both';
  if (register) return 'register';
  return 'medical_record';
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('id-ID');
}
