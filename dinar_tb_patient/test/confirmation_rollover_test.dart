// Regression tests for the "confirmation still shows yesterday" bug.
//
// Confirmation state must be bound to (treatment, Asia/Jakarta date) and reset
// when the WIB calendar day rolls over, including while the app stays alive.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:dinar_tb_patient/models/models.dart';
import 'package:dinar_tb_patient/services/confirmation_store.dart';

tz.TZDateTime wib(int y, int m, int d, int h, int min) =>
    tz.TZDateTime(tz.local, y, m, d, h, min);

tz.TZDateTime wibFromUtc(DateTime utc) =>
    tz.TZDateTime.from(utc, tz.getLocation('Asia/Jakarta'));

AdherenceHistory historyWith(
  String date,
  String status, {
  String? confirmedAt,
}) {
  return AdherenceHistory(
    treatmentCourseId: 't1',
    days: [AdherenceDay(date: date, status: status, confirmedAt: confirmedAt)],
    totalTaken: status == 'Sudah diminum' ? 1 : 0,
    totalMissed: status == 'MISSED' ? 1 : 0,
    missedStreak: 0,
  );
}

void main() {
  late Directory tempDir;

  setUpAll(() async {
    tempDir = await Directory.systemTemp.createTemp('dinar_confirmation_test');
    Hive.init(tempDir.path);
    Hive.registerAdapter(DoseConfirmationAdapter());
    tzdata.initializeTimeZones();
    tz.setLocalLocation(tz.getLocation('Asia/Jakarta'));
  });

  tearDown(() async {
    try {
      await Hive.deleteBoxFromDisk(ConfirmationStore.boxName);
    } catch (_) {
      // Box may not have been created by the test.
    }
  });

  tearDownAll(() async {
    await Hive.close();
    await tempDir.delete(recursive: true);
  });

  test('yesterday\'s confirmation does not count for today', () async {
    var now = wib(2026, 10, 17, 20, 0);
    final store = ConfirmationStore(jakartaNow: () => now);
    await store.init();

    await store.markConfirmed(treatmentId: 't1');
    expect(store.isTodayConfirmed(treatmentId: 't1'), isTrue);
    expect(store.getTodayConfirmedAt(treatmentId: 't1'), isNotNull);

    // Next WIB day, early morning.
    now = wib(2026, 10, 18, 6, 0);
    expect(store.isTodayConfirmed(treatmentId: 't1'), isFalse);
    expect(store.getTodayConfirmedAt(treatmentId: 't1'), isNull);

    // The previous day's history is preserved, not deleted.
    expect(store.isConfirmedOn('2026-10-17', treatmentId: 't1'), isTrue);
    expect(store.confirmedAtOn('2026-10-17', treatmentId: 't1'), isNotNull);

    await store.close();
  });

  test(
    'confirmation survives a cold start and still resets the next day',
    () async {
      var now = wib(2026, 10, 17, 20, 0);
      final first = ConfirmationStore(jakartaNow: () => now);
      await first.init();
      await first.markConfirmed(treatmentId: 't1');
      await first.close();

      // Reopen (app cold start) on the same day.
      final second = ConfirmationStore(jakartaNow: () => now);
      await second.init();
      expect(second.isTodayConfirmed(treatmentId: 't1'), isTrue);

      // Reopen the next morning: must be unconfirmed.
      now = wib(2026, 10, 18, 6, 0);
      final third = ConfirmationStore(jakartaNow: () => now);
      await third.init();
      expect(third.isTodayConfirmed(treatmentId: 't1'), isFalse);

      await second.close();
      await third.close();
    },
  );

  test('flips exactly at the WIB midnight boundary (17:00 UTC)', () async {
    var now = wibFromUtc(DateTime.utc(2026, 10, 17, 16, 59));
    final store = ConfirmationStore(jakartaNow: () => now);
    await store.init();

    expect(store.todayWib(), '2026-10-17');
    await store.markConfirmed(treatmentId: 't1');
    expect(store.isTodayConfirmed(treatmentId: 't1'), isTrue);

    // 17:00 UTC == 00:00 WIB on the next day.
    now = wibFromUtc(DateTime.utc(2026, 10, 17, 17, 0));
    expect(store.todayWib(), '2026-10-18');
    expect(store.isTodayConfirmed(treatmentId: 't1'), isFalse);

    await store.close();
  });

  test('legacy single-value confirmation migrates without leaking', () async {
    final legacy = await Hive.openBox('confirmation_meta');
    await legacy.put('confirmed_today_date', '2026-10-17');
    await legacy.put('confirmed_today_at', '2026-10-17T13:00:00.000Z');

    var now = wib(2026, 10, 17, 20, 0);
    final store = ConfirmationStore(jakartaNow: () => now);
    await store.init();
    await store.migrateLegacy(legacy);

    expect(store.isTodayConfirmed(), isTrue);
    expect(store.confirmedAtOn('2026-10-17'), isNotNull);

    now = wib(2026, 10, 18, 7, 0);
    expect(store.isTodayConfirmed(), isFalse);

    await store.close();
    await legacy.delete('confirmed_today_date');
    await legacy.delete('confirmed_today_at');
  });

  test('backend reconciliation adopts today, never yesterday', () async {
    var now = wib(2026, 10, 18, 7, 0);
    final store = ConfirmationStore(jakartaNow: () => now);
    await store.init();

    // Yesterday's taken status must not confirm today.
    await store.reconcileTodayFromAdherence(
      't1',
      historyWith('2026-10-17', 'Sudah diminum'),
    );
    expect(store.isTodayConfirmed(treatmentId: 't1'), isFalse);

    // A missed today must not confirm.
    await store.reconcileTodayFromAdherence(
      't1',
      historyWith('2026-10-18', 'MISSED'),
    );
    expect(store.isTodayConfirmed(treatmentId: 't1'), isFalse);

    // Today's taken status adopts the server timestamp.
    await store.reconcileTodayFromAdherence(
      't1',
      historyWith(
        '2026-10-18',
        'Sudah diminum',
        confirmedAt: '2026-10-18T00:30:00.000Z',
      ),
    );
    expect(store.isTodayConfirmed(treatmentId: 't1'), isTrue);
    expect(
      store.confirmedAtOn('2026-10-18', treatmentId: 't1')!.toUtc(),
      DateTime.utc(2026, 10, 18, 0, 30),
    );

    await store.close();
  });

  test('reconciliation keeps the first local timestamp for the day', () async {
    var now = wib(2026, 10, 18, 7, 0);
    final store = ConfirmationStore(jakartaNow: () => now);
    await store.init();

    await store.markConfirmed(
      treatmentId: 't1',
      atUtc: DateTime.utc(2026, 10, 18, 0, 5),
    );
    await store.reconcileTodayFromAdherence(
      't1',
      historyWith(
        '2026-10-18',
        'Sudah diminum',
        confirmedAt: '2026-10-18T06:00:00.000Z',
      ),
    );

    expect(
      store.confirmedAtOn('2026-10-18', treatmentId: 't1')!.toUtc(),
      DateTime.utc(2026, 10, 18, 0, 5),
    );

    await store.close();
  });
}
