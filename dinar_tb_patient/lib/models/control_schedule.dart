import 'package:hive/hive.dart';

part 'control_schedule.g.dart';

@HiveType(typeId: 2)
class ControlSchedule extends HiveObject {
  @HiveField(0)
  final String treatmentCourseId;

  @HiveField(1)
  final String? referenceVisitId;

  @HiveField(2)
  final String? defaultDate;

  @HiveField(3)
  final String scheduledDate;

  @HiveField(4)
  final int version;

  @HiveField(5)
  final DateTime? overriddenAt;

  ControlSchedule({
    required this.treatmentCourseId,
    this.referenceVisitId,
    this.defaultDate,
    required this.scheduledDate,
    required this.version,
    this.overriddenAt,
  });

  factory ControlSchedule.fromJson(Map<String, dynamic> json) {
    return ControlSchedule(
      treatmentCourseId: json['treatmentCourseId'] as String,
      referenceVisitId: json['referenceVisitId'] as String?,
      defaultDate: json['defaultDate'] as String?,
      scheduledDate: json['scheduledDate'] as String,
      version: json['version'] as int,
      overriddenAt: json['overriddenAt'] != null
          ? DateTime.parse(json['overriddenAt'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'treatmentCourseId': treatmentCourseId,
      'referenceVisitId': referenceVisitId,
      'defaultDate': defaultDate,
      'scheduledDate': scheduledDate,
      'version': version,
      'overriddenAt': overriddenAt?.toIso8601String(),
    };
  }
}
