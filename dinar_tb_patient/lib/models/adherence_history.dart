import 'package:hive/hive.dart';

part 'adherence_history.g.dart';

@HiveType(typeId: 5)
class AdherenceHistory extends HiveObject {
  @HiveField(0)
  final String? treatmentCourseId;

  @HiveField(1)
  final List<AdherenceDay> days;

  @HiveField(2)
  final int totalTaken;

  @HiveField(3)
  final int totalMissed;

  @HiveField(4)
  final int missedStreak;

  AdherenceHistory({
    this.treatmentCourseId,
    required this.days,
    required this.totalTaken,
    required this.totalMissed,
    required this.missedStreak,
  });

  factory AdherenceHistory.fromJson(Map<String, dynamic> json) {
    return AdherenceHistory(
      treatmentCourseId: json['treatmentCourseId'] as String?,
      days: (json['days'] as List<dynamic>)
          .map((e) => AdherenceDay.fromJson(e as Map<String, dynamic>))
          .toList(),
      totalTaken: json['totalTaken'] as int,
      totalMissed: json['totalMissed'] as int,
      missedStreak: json['missedStreak'] as int,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'treatmentCourseId': treatmentCourseId,
      'days': days.map((e) => e.toJson()).toList(),
      'totalTaken': totalTaken,
      'totalMissed': totalMissed,
      'missedStreak': missedStreak,
    };
  }
}

@HiveType(typeId: 6)
class AdherenceDay extends HiveObject {
  @HiveField(0)
  final String date;

  @HiveField(1)
  final String status;

  @HiveField(2)
  final String? confirmedAt;

  AdherenceDay({required this.date, required this.status, this.confirmedAt});

  factory AdherenceDay.fromJson(Map<String, dynamic> json) {
    return AdherenceDay(
      date: json['date'] as String,
      status: json['status'] as String,
      confirmedAt: json['confirmedAt'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {'date': date, 'status': status, 'confirmedAt': confirmedAt};
  }
}
