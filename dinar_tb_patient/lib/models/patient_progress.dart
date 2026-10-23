import 'adherence_history.dart';
import 'visit_record.dart';

class PatientProgress {
  final ProgressTreatment? treatment;
  final List<VisitRecord> visits;
  final AdherenceHistory? adherence;
  final String serverTime;

  PatientProgress({
    this.treatment,
    required this.visits,
    this.adherence,
    required this.serverTime,
  });

  factory PatientProgress.fromJson(Map<String, dynamic> json) {
    return PatientProgress(
      treatment: json['treatment'] == null
          ? null
          : ProgressTreatment.fromJson(
              json['treatment'] as Map<String, dynamic>,
            ),
      visits: (json['visits'] as List<dynamic>)
          .map((e) => VisitRecord.fromJson(e as Map<String, dynamic>))
          .toList(),
      adherence: json['adherence'] == null
          ? null
          : AdherenceHistory.fromJson(
              json['adherence'] as Map<String, dynamic>,
            ),
      serverTime: json['serverTime'] as String,
    );
  }
}

class ProgressTreatment {
  final String id;
  final String startDate;
  final String initialTargetEndDate;
  final String? continuedTargetEndDate;
  final DateTime? completedAt;
  final String? finalDecision;
  final String? finalReviewNote;
  final DateTime? finalReviewedAt;

  ProgressTreatment({
    required this.id,
    required this.startDate,
    required this.initialTargetEndDate,
    this.continuedTargetEndDate,
    this.completedAt,
    this.finalDecision,
    this.finalReviewNote,
    this.finalReviewedAt,
  });

  factory ProgressTreatment.fromJson(Map<String, dynamic> json) {
    return ProgressTreatment(
      id: json['id'] as String,
      startDate: json['startDate'] as String,
      initialTargetEndDate: json['initialTargetEndDate'] as String,
      continuedTargetEndDate: json['continuedTargetEndDate'] as String?,
      completedAt: json['completedAt'] == null
          ? null
          : DateTime.parse(json['completedAt'] as String),
      finalDecision: json['finalDecision'] as String?,
      finalReviewNote: json['finalReviewNote'] as String?,
      finalReviewedAt: json['finalReviewedAt'] == null
          ? null
          : DateTime.parse(json['finalReviewedAt'] as String),
    );
  }
}
