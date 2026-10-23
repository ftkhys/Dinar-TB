import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enforces patient identity uniqueness at the database level.
 *
 * Policy (see `src/common/patient-match.ts`): a patient's register number and
 * medical record number are identifiers that must not be shared with another
 * patient. Comparison ignores surrounding whitespace and letter case.
 *
 * The indexes are partial (`anonymized_at IS NULL`) so the synthetic
 * `ANON-xxxxxxxx` values written when a patient is anonymized never constrain a
 * new registration. Archived-but-not-anonymized patients are still covered.
 *
 * The migration refuses to run when the live table already contains a
 * normalized duplicate, so it can never silently drop or merge real data.
 * Existing duplicate candidates are reported by `npm run` tooling instead.
 */
export class AddPatientIdentityUniqueIndexes1791700000000 implements MigrationInterface {
  name = 'AddPatientIdentityUniqueIndexes1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const duplicateRegisters: Array<{ value: string; count: number }> = await queryRunner.query(
      `SELECT lower(btrim(register_number)) AS value, count(*)::int AS count
         FROM patients
        WHERE anonymized_at IS NULL
        GROUP BY lower(btrim(register_number))
       HAVING count(*) > 1`,
    );
    const duplicateRecords: Array<{ value: string; count: number }> = await queryRunner.query(
      `SELECT lower(btrim(medical_record_number)) AS value, count(*)::int AS count
         FROM patients
        WHERE anonymized_at IS NULL
        GROUP BY lower(btrim(medical_record_number))
       HAVING count(*) > 1`,
    );
    if (duplicateRegisters.length || duplicateRecords.length) {
      throw new Error(
        'Tidak dapat membuat index unik identitas pasien: ditemukan ' +
          `${duplicateRegisters.length} nilai Nomor Register dan ${duplicateRecords.length} nilai Nomor Rekam Medis yang duplikat ` +
          '(perbandingan mengabaikan spasi dan kapitalisasi). ' +
          'Selesaikan atau gabungkan data duplikat terlebih dahulu, lalu jalankan migrasi ini kembali.',
      );
    }

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "ux_patients_register_number_normalized"
         ON patients (lower(btrim(register_number)))
         WHERE anonymized_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "ux_patients_medical_record_number_normalized"
         ON patients (lower(btrim(medical_record_number)))
         WHERE anonymized_at IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "ux_patients_medical_record_number_normalized"');
    await queryRunner.query('DROP INDEX IF EXISTS "ux_patients_register_number_normalized"');
  }
}
