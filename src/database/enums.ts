export enum AdherenceStatus {
  NOT_CONFIRMED = 'Belum dikonfirmasi',
  TAKEN = 'Sudah diminum',
  MISSED = 'Terlewat',
}

export enum TreatmentDecision {
  COMPLETED = 'Selesai',
  CONTINUED = 'Dilanjutkan',
}

export enum FollowUpOutcome {
  ARRIVED = 'Pasien sudah datang',
  NOT_ARRIVED = 'Pasien belum datang',
  FORGOT_SCHEDULE = 'Pasien lupa jadwal',
  TRANSPORT_ISSUE = 'Pasien terkendala transportasi',
  ILL = 'Pasien sakit',
  UNREACHABLE = 'Pasien tidak dapat dihubungi',
  OTHER = 'Alasan lainnya',
}

export enum ProviderNotificationType {
  CONTROL_H_MINUS_ONE = 'CONTROL_H_MINUS_ONE',
  CONTROL_DUE = 'CONTROL_DUE',
  CONTROL_OVERDUE = 'CONTROL_OVERDUE',
  DOSE_REMINDER_MORNING = 'DOSE_REMINDER_MORNING',
  DOSE_REMINDER_EVENING = 'DOSE_REMINDER_EVENING',
}
