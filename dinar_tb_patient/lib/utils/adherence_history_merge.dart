import 'dart:math' as math;

import 'package:dinar_tb_patient/models/models.dart';

bool _isTaken(String status) => status == 'TAKEN' || status == 'Sudah diminum';

bool _isMissed(String status) => status == 'MISSED' || status == 'Terlewat';

/// Returns [history] with today's locally confirmed dose applied.
///
/// The confirmation store is the source of truth, so this is a pure projection
/// used at read time: a stale server copy or an old cache can never hide a
/// confirmation that already exists on the device. The caller decides whether
/// to persist the result; this function does not write anywhere.
AdherenceHistory? mergeLocalConfirmation({
  required AdherenceHistory? history,
  required String? treatmentCourseId,
  required String todayWib,
  required bool confirmed,
  required DateTime? confirmedAt,
}) {
  if (!confirmed) return history;

  final days = [...?history?.days];
  final index = days.indexWhere((day) => day.date == todayWib);
  final existing = index >= 0 ? days[index] : null;
  final alreadyTaken = existing != null && _isTaken(existing.status);

  if (alreadyTaken) return history;

  final wasMissed = existing != null && _isMissed(existing.status);
  final mergedDay = AdherenceDay(
    date: todayWib,
    status: 'Sudah diminum',
    confirmedAt: confirmedAt?.toUtc().toIso8601String(),
  );

  if (index >= 0) {
    days[index] = mergedDay;
  } else {
    days.add(mergedDay);
  }
  days.sort((a, b) => a.date.compareTo(b.date));

  return AdherenceHistory(
    treatmentCourseId: treatmentCourseId ?? history?.treatmentCourseId,
    days: days,
    totalTaken: (history?.totalTaken ?? 0) + 1,
    totalMissed: wasMissed
        ? math.max(0, (history?.totalMissed ?? 0) - 1)
        : (history?.totalMissed ?? 0),
    missedStreak: wasMissed ? 0 : (history?.missedStreak ?? 0),
  );
}
