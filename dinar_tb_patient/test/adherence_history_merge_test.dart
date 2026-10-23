import 'package:dinar_tb_patient/models/models.dart';
import 'package:dinar_tb_patient/utils/adherence_history_merge.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const today = '2026-10-20';
  final confirmedAt = DateTime.utc(2026, 10, 20, 0, 15);

  test('offline confirmation is visible even without any cached history', () {
    final merged = mergeLocalConfirmation(
      history: null,
      treatmentCourseId: 't1',
      todayWib: today,
      confirmed: true,
      confirmedAt: confirmedAt,
    );

    expect(merged, isNotNull);
    expect(merged!.treatmentCourseId, 't1');
    expect(merged.days, hasLength(1));
    expect(merged.days.single.date, today);
    expect(merged.days.single.status, 'Sudah diminum');
    expect(merged.totalTaken, 1);
    expect(merged.totalMissed, 0);
    expect(merged.missedStreak, 0);
  });

  test('an unconfirmed day leaves the history untouched', () {
    final history = AdherenceHistory(
      treatmentCourseId: 't1',
      days: [AdherenceDay(date: today, status: 'Belum dikonfirmasi')],
      totalTaken: 0,
      totalMissed: 0,
      missedStreak: 0,
    );

    final merged = mergeLocalConfirmation(
      history: history,
      treatmentCourseId: 't1',
      todayWib: today,
      confirmed: false,
      confirmedAt: null,
    );

    expect(identical(merged, history), isTrue);
  });

  test('a stale unconfirmed day is replaced and counted once', () {
    final history = AdherenceHistory(
      treatmentCourseId: 't1',
      days: [
        AdherenceDay(date: '2026-10-19', status: 'Sudah diminum'),
        AdherenceDay(date: today, status: 'Belum dikonfirmasi'),
      ],
      totalTaken: 1,
      totalMissed: 0,
      missedStreak: 0,
    );

    final merged = mergeLocalConfirmation(
      history: history,
      treatmentCourseId: 't1',
      todayWib: today,
      confirmed: true,
      confirmedAt: confirmedAt,
    )!;

    expect(merged.days, hasLength(2));
    expect(merged.days.last.status, 'Sudah diminum');
    expect(merged.days.last.confirmedAt, confirmedAt.toIso8601String());
    expect(merged.totalTaken, 2);
    expect(merged.totalMissed, 0);
  });

  test(
    'a locally missed day becomes taken without inflating missed totals',
    () {
      final history = AdherenceHistory(
        treatmentCourseId: 't1',
        days: [AdherenceDay(date: today, status: 'Terlewat')],
        totalTaken: 3,
        totalMissed: 1,
        missedStreak: 2,
      );

      final merged = mergeLocalConfirmation(
        history: history,
        treatmentCourseId: 't1',
        todayWib: today,
        confirmed: true,
        confirmedAt: confirmedAt,
      )!;

      expect(merged.totalTaken, 4);
      expect(merged.totalMissed, 0);
      expect(merged.missedStreak, 0);
    },
  );

  test('an already taken day is not counted twice', () {
    final history = AdherenceHistory(
      treatmentCourseId: 't1',
      days: [
        AdherenceDay(
          date: today,
          status: 'Sudah diminum',
          confirmedAt: '2026-10-20T00:00:00.000Z',
        ),
      ],
      totalTaken: 1,
      totalMissed: 0,
      missedStreak: 0,
    );

    final merged = mergeLocalConfirmation(
      history: history,
      treatmentCourseId: 't1',
      todayWib: today,
      confirmed: true,
      confirmedAt: confirmedAt,
    );

    expect(identical(merged, history), isTrue);
  });
}
