import 'package:hive/hive.dart';

part 'dose_confirmation.g.dart';

/// A single medicine confirmation, bound to one treatment course and one
/// Asia/Jakarta (WIB) calendar date.
///
/// Keeping the WIB date in the record (instead of a single global "last
/// confirmed date") is what stops yesterday's confirmation from being shown on
/// a new day.
@HiveType(typeId: 10)
class DoseConfirmation extends HiveObject {
  @HiveField(0)
  final String treatmentCourseId;

  /// Calendar date in Asia/Jakarta, `YYYY-MM-DD`.
  @HiveField(1)
  final String wibDate;

  /// When the patient confirmed, stored as an ISO-8601 UTC timestamp.
  @HiveField(2)
  final String confirmedAtUtc;

  /// The dose window (`HH:mm`) that was active when confirming, if known.
  @HiveField(3)
  final String? window;

  DoseConfirmation({
    required this.treatmentCourseId,
    required this.wibDate,
    required this.confirmedAtUtc,
    this.window,
  });

  factory DoseConfirmation.fromJson(Map<String, dynamic> json) {
    return DoseConfirmation(
      treatmentCourseId: json['treatmentCourseId'] as String,
      wibDate: json['wibDate'] as String,
      confirmedAtUtc: json['confirmedAtUtc'] as String,
      window: json['window'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'treatmentCourseId': treatmentCourseId,
      'wibDate': wibDate,
      'confirmedAtUtc': confirmedAtUtc,
      'window': window,
    };
  }
}
