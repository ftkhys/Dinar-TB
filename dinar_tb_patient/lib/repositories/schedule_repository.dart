import 'package:hive/hive.dart';
import 'package:dinar_tb_patient/models/models.dart';

class ScheduleRepository {
  static const String _patientBoxName = 'patient';
  static const String _treatmentBoxName = 'treatments';
  static const String _scheduleBoxName = 'schedules';
  static const String _syncMetaBoxName = 'sync_meta';
  static const String _reminderWindowsBoxName = 'reminder_windows';
  static const String _visitsBoxName = 'visits';
  static const String _historyBoxName = 'adherence_history';

  static const String _patientKey = 'current_patient';
  static const String _maxVersionKey = 'max_version';
  static const String _maxScheduleVersionKey = 'max_schedule_version';
  static const String _maxTimestampKey = 'max_sync_timestamp';
  static const String _lastSyncKey = 'last_sync_time';
  static const String _clinicNameKey = 'clinic_name';
  static const String _clinicPhoneKey = 'clinic_phone';

  Box<Patient>? _patientBox;
  Box<TreatmentCourse>? _treatmentBox;
  Box<ControlSchedule>? _scheduleBox;
  Box<dynamic>? _metaBox;
  Box<ReminderWindow>? _reminderWindowsBox;
  Box<VisitRecord>? _visitsBox;
  Box<AdherenceHistory>? _historyBox;

  Future<void> init() async {
    _patientBox = await Hive.openBox<Patient>(_patientBoxName);
    _treatmentBox = await Hive.openBox<TreatmentCourse>(_treatmentBoxName);
    _scheduleBox = await Hive.openBox<ControlSchedule>(_scheduleBoxName);
    _metaBox = await Hive.openBox(_syncMetaBoxName);
    _reminderWindowsBox = await Hive.openBox<ReminderWindow>(
      _reminderWindowsBoxName,
    );
    _visitsBox = await Hive.openBox<VisitRecord>(_visitsBoxName);
    _historyBox = await Hive.openBox<AdherenceHistory>(_historyBoxName);
  }

  // Patient operations
  Future<void> savePatient(Patient patient) async {
    await _patientBox!.put(_patientKey, patient);
  }

  Patient? getPatient() {
    return _patientBox?.get(_patientKey);
  }

  /// Last officially synced staff status. Absence of local data is treated as
  /// still active so an offline first launch never silently disables reminders.
  bool get isPatientArchived => getPatient()?.isArchived ?? false;

  // Treatment operations
  Future<void> saveTreatments(List<TreatmentCourse> treatments) async {
    for (final treatment in treatments) {
      await _treatmentBox!.put(treatment.id, treatment);
    }
  }

  Future<void> saveTreatment(TreatmentCourse treatment) async {
    await _treatmentBox!.put(treatment.id, treatment);
  }

  List<TreatmentCourse> getAllTreatments() {
    return _treatmentBox?.values.toList() ?? [];
  }

  /// The course the app should present as the patient's current treatment.
  ///
  /// Prefer an active course; if treatment is finished, show the most recently
  /// started completed course instead of an arbitrary first Hive value. This
  /// matters once a second course has been created after an earlier one ended.
  TreatmentCourse? getCurrentTreatment() {
    final treatments = getAllTreatments();
    if (treatments.isEmpty) return null;
    final active = treatments.where((treatment) => treatment.isActive).toList();
    final candidates = active.isNotEmpty ? active : treatments;
    candidates.sort((a, b) {
      final byStart = b.startDate.compareTo(a.startDate);
      return byStart != 0 ? byStart : b.id.compareTo(a.id);
    });
    return candidates.first;
  }

  /// The control schedule for [getCurrentTreatment] only. Never falls back to a
  /// previous course's schedule, which would show an outdated control date.
  ControlSchedule? getCurrentSchedule() {
    final treatment = getCurrentTreatment();
    if (treatment == null) return null;
    return getSchedule(treatment.id);
  }

  TreatmentCourse? getTreatment(String id) {
    return _treatmentBox?.get(id);
  }

  Future<void> deleteTreatment(String id) async {
    await _treatmentBox!.delete(id);
  }

  // Schedule operations
  Future<void> saveSchedules(List<ControlSchedule> schedules) async {
    for (final schedule in schedules) {
      await _scheduleBox!.put(schedule.treatmentCourseId, schedule);
    }
  }

  Future<void> saveSchedule(ControlSchedule schedule) async {
    await _scheduleBox!.put(schedule.treatmentCourseId, schedule);
  }

  List<ControlSchedule> getAllSchedules() {
    return _scheduleBox?.values.toList() ?? [];
  }

  ControlSchedule? getSchedule(String treatmentCourseId) {
    return _scheduleBox?.get(treatmentCourseId);
  }

  Future<void> deleteSchedule(String treatmentCourseId) async {
    await _scheduleBox!.delete(treatmentCourseId);
  }

  // Reminder windows operations
  //
  // This is a REPLACE, not a merge: the backend always sends the full, current
  // set of windows, so any previously stored window (for example the old 06:00
  // morning slot after the admin moved it to 08:00) must be removed. Merging by
  // start time would leave stale windows behind and schedule duplicate reminders.
  //
  // An empty payload is treated as "no update" so a malformed, partial, or
  // offline response can never wipe the last successfully applied schedule.
  Future<void> saveReminderWindows(List<ReminderWindow> windows) async {
    if (windows.isEmpty) return;
    await _reminderWindowsBox!.clear();
    for (final window in windows) {
      await _reminderWindowsBox!.put(window.start, window);
    }
  }

  List<ReminderWindow> getReminderWindows() {
    return _reminderWindowsBox?.values.toList() ?? [];
  }

  // Clinic identity (from the backend `clinic` object)
  Future<void> setClinic(String? name, String? phone) async {
    if (name != null && name.isNotEmpty) {
      await _metaBox!.put(_clinicNameKey, name);
    }
    await _metaBox!.put(_clinicPhoneKey, phone);
  }

  String? getClinicName() {
    return _metaBox?.get(_clinicNameKey) as String?;
  }

  String? getClinicPhone() {
    return _metaBox?.get(_clinicPhoneKey) as String?;
  }

  // Control visits (from `GET /patient/me/progress`)
  //
  // Replace-all: the progress endpoint returns the complete visit history for
  // the patient, so stale rows (for example a visit that was corrected
  // server-side) must not survive. Callers only invoke this after a successful
  // fetch, so a failed request leaves the previous cache intact.
  Future<void> saveVisits(List<VisitRecord> visits) async {
    await _visitsBox!.clear();
    for (final visit in visits) {
      await _visitsBox!.put(visit.id, visit);
    }
  }

  List<VisitRecord> getAllVisits() {
    final visits = _visitsBox?.values.toList() ?? [];
    visits.sort((a, b) => b.visitDate.compareTo(a.visitDate));
    return visits;
  }

  // Adherence history cache (keyed by treatment course id)
  //
  // The progress endpoint's adherence summary does not echo the treatment id,
  // so the caller passes it explicitly.
  Future<void> saveAdherenceHistory(
    String treatmentCourseId,
    AdherenceHistory history,
  ) async {
    await _historyBox!.put(treatmentCourseId, history);
  }

  AdherenceHistory? getAdherenceHistory(String treatmentCourseId) {
    return _historyBox?.get(treatmentCourseId);
  }

  // Sync metadata
  Future<void> setMaxVersion(int version) async {
    await _metaBox!.put(_maxVersionKey, version);
  }

  int getMaxVersion() {
    return _metaBox?.get(_maxVersionKey) as int? ?? 0;
  }

  /// Cursor for `control_schedule` changes. Kept separate from [_maxVersionKey]
  /// because a control-date override advances only the schedule version, so a
  /// shared cursor could skip a schedule-only change.
  Future<void> setMaxScheduleVersion(int version) async {
    await _metaBox!.put(_maxScheduleVersionKey, version);
  }

  int getMaxScheduleVersion() {
    return _metaBox?.get(_maxScheduleVersionKey) as int? ?? 0;
  }

  /// Server-clock cursor for incremental syncs. Versions are per row, so they
  /// cannot safely represent "everything before this point"; a timestamp can.
  Future<void> setMaxSyncTimestamp(String timestamp) async {
    await _metaBox!.put(_maxTimestampKey, timestamp);
  }

  String? getMaxSyncTimestamp() {
    return _metaBox?.get(_maxTimestampKey) as String?;
  }

  Future<void> setLastSyncTime(DateTime time) async {
    await _metaBox!.put(_lastSyncKey, time.toIso8601String());
  }

  DateTime? getLastSyncTime() {
    final timeStr = _metaBox?.get(_lastSyncKey) as String?;
    if (timeStr == null) return null;
    return DateTime.tryParse(timeStr);
  }

  // Cleanup operations
  Future<void> removeSchedulesNotIn(List<String> treatmentCourseIds) async {
    final existingKeys = _scheduleBox!.keys.cast<String>().toList();
    for (final key in existingKeys) {
      if (!treatmentCourseIds.contains(key)) {
        await _scheduleBox!.delete(key);
      }
    }
  }

  Future<void> clearAll() async {
    await _patientBox?.clear();
    await _treatmentBox?.clear();
    await _scheduleBox?.clear();
    await _metaBox?.clear();
    await _reminderWindowsBox?.clear();
    await _visitsBox?.clear();
    await _historyBox?.clear();
  }
}
