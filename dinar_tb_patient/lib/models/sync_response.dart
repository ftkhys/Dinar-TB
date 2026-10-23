import 'package:hive/hive.dart';
import 'patient.dart';
import 'treatment_course.dart';
import 'control_schedule.dart';
import 'reminder_window.dart';

part 'sync_response.g.dart';

@HiveType(typeId: 3)
class SyncResponse extends HiveObject {
  @HiveField(0)
  final Patient patient;

  @HiveField(1)
  final List<TreatmentCourse> treatmentCourses;

  @HiveField(2)
  final List<ControlSchedule> controlSchedules;

  @HiveField(3)
  final List<ReminderWindow> reminderWindows;

  @HiveField(4)
  final String serverTime;

  @HiveField(5)
  final bool hasMore;

  /// Highest `treatment_courses.version` in this payload. This is the cursor
  /// for treatment changes (including the month-6 completion decision).
  @HiveField(6)
  final int maxVersion;

  /// Highest `control_schedule.version` in this payload. Tracked separately from
  /// [maxVersion] because a control-date override bumps only the schedule
  /// version, never the treatment-course version. Not persisted through Hive
  /// (this DTO is transport-only).
  final int maxScheduleVersion;

  /// Clinic identity from the backend (`clinic` object). Not persisted through
  /// Hive (this DTO is transport-only); it is copied into the repository's meta
  /// box so offline screens can show the real facility name/phone.
  final String? clinicName;
  final String? clinicPhone;

  SyncResponse({
    required this.patient,
    required this.treatmentCourses,
    required this.controlSchedules,
    required this.reminderWindows,
    required this.serverTime,
    required this.hasMore,
    required this.maxVersion,
    this.maxScheduleVersion = 0,
    this.clinicName,
    this.clinicPhone,
  });

  factory SyncResponse.fromJson(Map<String, dynamic> json) {
    final clinic = json['clinic'] as Map<String, dynamic>?;
    return SyncResponse(
      patient: Patient.fromJson(json['patient'] as Map<String, dynamic>),
      treatmentCourses: (json['treatmentCourses'] as List<dynamic>)
          .map((e) => TreatmentCourse.fromJson(e as Map<String, dynamic>))
          .toList(),
      controlSchedules: (json['controlSchedules'] as List<dynamic>)
          .map((e) => ControlSchedule.fromJson(e as Map<String, dynamic>))
          .toList(),
      reminderWindows: (json['reminderWindows'] as List<dynamic>)
          .map((e) => ReminderWindow.fromJson(e as Map<String, dynamic>))
          .toList(),
      serverTime: json['serverTime'] as String,
      hasMore: json['hasMore'] as bool,
      maxVersion: json['maxVersion'] as int? ?? 0,
      maxScheduleVersion: json['maxScheduleVersion'] as int? ?? 0,
      clinicName: clinic?['name'] as String?,
      clinicPhone: clinic?['phone'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'patient': patient.toJson(),
      'treatmentCourses': treatmentCourses.map((e) => e.toJson()).toList(),
      'controlSchedules': controlSchedules.map((e) => e.toJson()).toList(),
      'reminderWindows': reminderWindows.map((e) => e.toJson()).toList(),
      'serverTime': serverTime,
      'hasMore': hasMore,
      'maxVersion': maxVersion,
    };
  }
}
