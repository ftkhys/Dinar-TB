import { nextServiceDay } from '../common/date-rules';

/**
 * Status shown in the Daftar Jadwal Kontrol. Derived from the schedule's own
 * date plus the treatment completion flag — a recorded visit never completes a
 * schedule by itself, only a completed treatment course does.
 */
export const CONTROL_SCHEDULE_STATUSES = ['Hari Ini', 'Besok', 'Terlambat', 'Mendatang', 'Selesai', 'Perlu Konfirmasi'] as const;
export type ControlScheduleStatus = (typeof CONTROL_SCHEDULE_STATUSES)[number];

export function controlScheduleStatus(
  scheduledDate: string,
  today: string,
  completed: boolean,
): ControlScheduleStatus {
  if (completed) return 'Selesai';
  if (scheduledDate < today) return 'Terlambat';
  if (scheduledDate === today) return 'Hari Ini';
  if (scheduledDate === nextServiceDay(today)) return 'Besok';
  return 'Mendatang';
}
