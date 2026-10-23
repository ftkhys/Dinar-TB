import 'package:hive/hive.dart';

part 'adherence_operation.g.dart';

@HiveType(typeId: 7)
class AdherenceOperation extends HiveObject {
  @HiveField(0)
  final String operationId;

  @HiveField(1)
  final String treatmentCourseId;

  @HiveField(2)
  final String adherenceDate;

  @HiveField(3)
  final String confirmedAt;

  @HiveField(4)
  final int expectedTreatmentVersion;

  @HiveField(5)
  final int retryCount;

  @HiveField(6)
  final DateTime createdAt;

  @HiveField(7)
  DateTime? lastAttemptAt;

  @HiveField(8)
  final AdherenceOperationStatus status;

  AdherenceOperation({
    required this.operationId,
    required this.treatmentCourseId,
    required this.adherenceDate,
    required this.confirmedAt,
    required this.expectedTreatmentVersion,
    this.retryCount = 0,
    required this.createdAt,
    this.lastAttemptAt,
    this.status = AdherenceOperationStatus.pending,
  });

  factory AdherenceOperation.fromJson(Map<String, dynamic> json) {
    return AdherenceOperation(
      operationId: json['operationId'] as String,
      treatmentCourseId: json['treatmentCourseId'] as String,
      adherenceDate: json['adherenceDate'] as String,
      confirmedAt: json['confirmedAt'] as String,
      expectedTreatmentVersion: json['expectedTreatmentVersion'] as int,
      retryCount: json['retryCount'] as int? ?? 0,
      createdAt: DateTime.parse(json['createdAt'] as String),
      lastAttemptAt: json['lastAttemptAt'] != null
          ? DateTime.parse(json['lastAttemptAt'] as String)
          : null,
      status: json['status'] != null
          ? AdherenceOperationStatus.values.firstWhere(
              (e) => e.name == json['status'],
              orElse: () => AdherenceOperationStatus.pending,
            )
          : AdherenceOperationStatus.pending,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'operationId': operationId,
      'treatmentCourseId': treatmentCourseId,
      'adherenceDate': adherenceDate,
      'confirmedAt': confirmedAt,
      'expectedTreatmentVersion': expectedTreatmentVersion,
      'retryCount': retryCount,
      'createdAt': createdAt.toIso8601String(),
      'lastAttemptAt': lastAttemptAt?.toIso8601String(),
      'status': status.name,
    };
  }

  AdherenceOperation copyWith({
    int? retryCount,
    DateTime? lastAttemptAt,
    AdherenceOperationStatus? status,
  }) {
    return AdherenceOperation(
      operationId: operationId,
      treatmentCourseId: treatmentCourseId,
      adherenceDate: adherenceDate,
      confirmedAt: confirmedAt,
      expectedTreatmentVersion: expectedTreatmentVersion,
      retryCount: retryCount ?? this.retryCount,
      createdAt: createdAt,
      lastAttemptAt: lastAttemptAt ?? this.lastAttemptAt,
      status: status ?? this.status,
    );
  }
}

@HiveType(typeId: 8)
enum AdherenceOperationStatus {
  @HiveField(0)
  pending,
  @HiveField(1)
  needsAttention,
  @HiveField(2)
  completed,
}
