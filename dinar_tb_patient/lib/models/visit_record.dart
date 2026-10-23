import 'package:hive/hive.dart';

part 'visit_record.g.dart';

@HiveType(typeId: 9)
class VisitRecord extends HiveObject {
  @HiveField(0)
  final String id;

  @HiveField(1)
  final String visitDate;

  @HiveField(2)
  final bool medicineGiven;

  @HiveField(3)
  final String? medicationGivenOn;

  @HiveField(4)
  final String? complaintProgress;

  @HiveField(5)
  final String? additionalNote;

  VisitRecord({
    required this.id,
    required this.visitDate,
    required this.medicineGiven,
    this.medicationGivenOn,
    this.complaintProgress,
    this.additionalNote,
  });

  factory VisitRecord.fromJson(Map<String, dynamic> json) {
    return VisitRecord(
      id: json['id'] as String,
      visitDate: json['visitDate'] as String,
      medicineGiven: json['medicineGiven'] as bool,
      medicationGivenOn: json['medicationGivenOn'] as String?,
      complaintProgress: json['complaintProgress'] as String?,
      additionalNote: json['additionalNote'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'visitDate': visitDate,
      'medicineGiven': medicineGiven,
      'medicationGivenOn': medicationGivenOn,
      'complaintProgress': complaintProgress,
      'additionalNote': additionalNote,
    };
  }
}
