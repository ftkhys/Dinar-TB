import { addCalendarDays } from '../common/date-rules';

export type ControlAlertLevel = 'H-1' | 'Hari-H' | 'Terlambat';

export function controlAlertLevel(scheduledDate: string, today: string): ControlAlertLevel | null {
  if (scheduledDate === addCalendarDays(today, 1)) return 'H-1';
  if (scheduledDate === today) return 'Hari-H';
  if (scheduledDate < today) return 'Terlambat';
  return null;
}

export function controlAlertMessage(
  patientName: string,
  scheduledDate: string,
  unmedicatedVisitDate?: string | null,
): string {
  if (unmedicatedVisitDate) {
    return `Pasien sudah tercatat melakukan kunjungan pada ${unmedicatedVisitDate} tanpa pemberian obat. Jadwal kontrol ${patientName} pada ${scheduledDate} masih belum terpenuhi.`;
  }
  return `Pasien belum melakukan kontrol. ${patientName} dijadwalkan kontrol pada ${scheduledDate}, tetapi sampai saat ini belum tercatat melakukan kunjungan.`;
}
