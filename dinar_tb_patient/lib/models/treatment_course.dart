import 'package:hive/hive.dart';

part 'treatment_course.g.dart';

@HiveType(typeId: 1)
class TreatmentCourse extends HiveObject {
  @HiveField(0)
  final String id;

  @HiveField(1)
  final String patientId;

  @HiveField(2)
  final String startDate;

  @HiveField(3)
  final String initialTargetEndDate;

  @HiveField(4)
  final String? finalDecision;

  @HiveField(5)
  final String? finalReviewNote;

  @HiveField(6)
  final DateTime? finalReviewedAt;

  @HiveField(7)
  final String? continuedTargetEndDate;

  @HiveField(8)
  final DateTime? completedAt;

  @HiveField(9)
  final int version;

  @HiveField(10)
  final bool reviewDue;

  @HiveField(11)
  final bool remindersEnabled;

  @HiveField(12)
  final String? displayMessage;

  TreatmentCourse({
    required this.id,
    required this.patientId,
    required this.startDate,
    required this.initialTargetEndDate,
    this.finalDecision,
    this.finalReviewNote,
    this.finalReviewedAt,
    this.continuedTargetEndDate,
    this.completedAt,
    required this.version,
    required this.reviewDue,
    required this.remindersEnabled,
    this.displayMessage,
  });

  factory TreatmentCourse.fromJson(Map<String, dynamic> json) {
    return TreatmentCourse(
      id: json['id'] as String,
      patientId: json['patientId'] as String,
      startDate: json['startDate'] as String,
      initialTargetEndDate: json['initialTargetEndDate'] as String,
      finalDecision: json['finalDecision'] as String?,
      finalReviewNote: json['finalReviewNote'] as String?,
      finalReviewedAt: json['finalReviewedAt'] != null
          ? DateTime.parse(json['finalReviewedAt'] as String)
          : null,
      continuedTargetEndDate: json['continuedTargetEndDate'] as String?,
      completedAt: json['completedAt'] != null
          ? DateTime.parse(json['completedAt'] as String)
          : null,
      version: json['version'] as int,
      reviewDue: json['reviewDue'] as bool,
      remindersEnabled: json['remindersEnabled'] as bool,
      displayMessage: json['displayMessage'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'patientId': patientId,
      'startDate': startDate,
      'initialTargetEndDate': initialTargetEndDate,
      'finalDecision': finalDecision,
      'finalReviewNote': finalReviewNote,
      'finalReviewedAt': finalReviewedAt?.toIso8601String(),
      'continuedTargetEndDate': continuedTargetEndDate,
      'completedAt': completedAt?.toIso8601String(),
      'version': version,
      'reviewDue': reviewDue,
      'remindersEnabled': remindersEnabled,
      'displayMessage': displayMessage,
    };
  }

  bool get isActive => completedAt == null;
  bool get isCompleted => completedAt != null;
}
