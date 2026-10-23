import 'dotenv/config';
import { stdout } from 'node:process';
import { dataSource } from './data-source';
import { TreatmentCourse } from './entities/treatment-course.entity';
import { buildHistoryPatch, TreatmentHistoryCandidate } from './treatment-history-backfill';

/**
 * Audit + backfill for the two treatment-history dates added by
 * `AddTreatmentHistoryDates1791800000000`.
 *
 * The dates are derived ONLY from real recorded visits:
 *   - last_control_date    <- MAX(control_visits.visit_date)
 *   - last_medication_date <- MAX(control_visits.medication_given_on)
 *                             WHERE medicine_given = true
 *
 * A medication date is NEVER inferred from a control date: a control without a
 * recorded dispense (`medicine_given = false`) contributes nothing to the
 * medication date. A column that already holds a value (including a manual
 * correction) is never overwritten.
 *
 * Safety:
 *   - Read-only by default: prints a preview of exactly what would change.
 *   - Writes only when run with an explicit `--apply` flag.
 *   - Never runs automatically with app startup or migrations.
 *
 * Usage:
 *   npm run <script> --            # preview (read-only)
 *   npm run <script> -- --apply    # apply the backfill
 */
async function collect(): Promise<{ candidates: TreatmentHistoryCandidate[]; totalActive: number }> {
  const rows: TreatmentHistoryCandidate[] = await dataSource.query(
    `SELECT tc.id AS "treatmentId",
            to_char(tc.start_date, 'YYYY-MM-DD') AS "startDate",
            to_char(MAX(cv.visit_date), 'YYYY-MM-DD') AS "lastControlDate",
            to_char(MAX(cv.medication_given_on) FILTER (WHERE cv.medicine_given), 'YYYY-MM-DD') AS "lastMedicationDate",
            to_char(tc.last_control_date, 'YYYY-MM-DD') AS "existingControlDate",
            to_char(tc.last_medication_date, 'YYYY-MM-DD') AS "existingMedicationDate"
       FROM treatment_courses tc
       LEFT JOIN control_visits cv ON cv.treatment_course_id = tc.id
      WHERE tc.last_control_date IS NULL
         OR tc.last_medication_date IS NULL
      GROUP BY tc.id, tc.start_date, tc.last_control_date, tc.last_medication_date`,
  );
  const [countRow] = (await dataSource.query(
    `SELECT count(*)::int AS count FROM treatment_courses`,
  )) as Array<{ count: number }>;
  return { candidates: rows, totalActive: Number(countRow?.count ?? 0) };
}

function isoDate(value: Date | string): string {
  return typeof value === 'string' ? value : value.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await dataSource.initialize();
  try {
    const { candidates, totalActive } = await collect();

    const plans = candidates.map((row) => ({ row, patch: buildHistoryPatch(row) }));
    const withControl = plans.filter(({ patch }) => patch.lastControlDate !== undefined);
    const withMedication = plans.filter(({ patch }) => patch.lastMedicationDate !== undefined);
    const withoutVisits = candidates.filter(
      (row) => row.lastControlDate === null && row.lastMedicationDate === null,
    );
    const protectedManual = candidates.filter(
      (row) => row.existingControlDate !== null || row.existingMedicationDate !== null,
    ).length;

    stdout.write(`Total treatment_courses       : ${totalActive}\n`);
    stdout.write(`Tanpa lengkap / perlu backfill: ${candidates.length}\n`);
    stdout.write(`  - akan diisi tanggal kontrol: ${withControl.length}\n`);
    stdout.write(`  - akan diisi tanggal obat   : ${withMedication.length}\n`);
    stdout.write(`  - tanpa kunjungan (dilewati): ${withoutVisits.length}\n`);
    stdout.write(`  - dilindungi (sudah ada)    : ${protectedManual}\n\n`);

    const previewCount = Math.min(candidates.length, 25);
    for (const row of candidates.slice(0, previewCount)) {
      const patch = buildHistoryPatch(row);
      const note = row.existingControlDate !== null || row.existingMedicationDate !== null ? '  [sebagian sudah ada]' : '';
      stdout.write(
        `  ${row.treatmentId}  start=${row.startDate}  kontrol=${row.lastControlDate ?? '—'}  obat=${row.lastMedicationDate ?? '—'}  ->  ${JSON.stringify(patch)}${note}\n`,
      );
    }
    if (candidates.length > previewCount) {
      stdout.write(`  ... dan ${candidates.length - previewCount} baris lain\n`);
    }

    if (!apply) {
      stdout.write('\nMode pratinjau (read-only). Jalankan dengan --apply untuk menerapkan.\n');
      return;
    }

    let updated = 0;
    await dataSource.transaction(async (manager) => {
      for (const { row, patch } of plans) {
        if (Object.keys(patch).length === 0) continue;
        await manager.getRepository(TreatmentCourse).update(
          { id: row.treatmentId },
          {
            ...(patch.lastControlDate !== undefined ? { lastControlDate: isoDate(patch.lastControlDate) } : {}),
            ...(patch.lastMedicationDate !== undefined ? { lastMedicationDate: isoDate(patch.lastMedicationDate) } : {}),
          },
        );
        updated += 1;
      }
    });
    stdout.write(`\nSelesai. ${updated} treatment_courses diperbarui.\n`);
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
