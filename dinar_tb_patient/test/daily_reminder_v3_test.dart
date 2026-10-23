// Regression tests for the daily reminder concept v3: evening follow-ups,
// midnight boundaries, the bundled 15 second sound and the daily countdown.
// Pure tests: no Android device or notification plugin is required.

import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import 'package:dinar_tb_patient/services/notification_service.dart';
import 'package:dinar_tb_patient/widgets/daily_countdown.dart';

void main() {
  setUpAll(() {
    tzdata.initializeTimeZones();
    tz.setLocalLocation(tz.getLocation('Asia/Jakarta'));
  });

  List<String> windowsFor(List<DoseReminderPlan> plan, String date) => plan
      .where((item) => item.date == date)
      .map((item) => item.window)
      .toList();

  group('pengingat lanjutan malam', () {
    test('trails the last window every 30 minutes until 23:30', () {
      final plan = buildDoseReminderPlan(
        now: tz.TZDateTime(tz.local, 2026, 10, 19, 10, 0),
        windows: const ['06:00', '20:00'],
        horizonDays: 1,
        skipToday: false,
        endDate: DateTime(2027, 12, 31),
        followUpHorizonDays: 1,
      );

      expect(windowsFor(plan, '2026-10-19'), [
        '20:00',
        '20:30',
        '21:00',
        '21:30',
        '22:00',
        '22:30',
        '23:00',
        '23:30',
      ]);
      expect(windowsFor(plan, '2026-10-20'), [
        '06:00',
        '20:00',
        '20:30',
        '21:00',
        '21:30',
        '22:00',
        '22:30',
        '23:00',
        '23:30',
      ]);
    });

    test('never spills past 23:30 into the next day', () {
      final plan = buildDoseReminderPlan(
        now: tz.TZDateTime(tz.local, 2026, 10, 19, 10, 0),
        windows: const ['23:00'],
        horizonDays: 0,
        skipToday: false,
        endDate: DateTime(2027, 12, 31),
        followUpHorizonDays: 1,
      );

      expect(windowsFor(plan, '2026-10-19'), ['23:00', '23:30']);
      expect(windowsFor(plan, '2026-10-19'), isNot(contains('00:00')));
    });

    test('adds no follow-ups when the evening window is already 23:45', () {
      final plan = buildDoseReminderPlan(
        now: tz.TZDateTime(tz.local, 2026, 10, 19, 10, 0),
        windows: const ['23:45'],
        horizonDays: 0,
        skipToday: false,
        endDate: DateTime(2027, 12, 31),
        followUpHorizonDays: 1,
      );

      expect(windowsFor(plan, '2026-10-19'), ['23:45']);
    });

    test('keeps late-evening follow-ups on the current WIB date', () {
      final plan = buildDoseReminderPlan(
        now: tz.TZDateTime(tz.local, 2026, 10, 19, 23, 0),
        windows: const ['20:00'],
        horizonDays: 0,
        skipToday: false,
        endDate: DateTime(2027, 12, 31),
        followUpHorizonDays: 1,
      );

      expect(windowsFor(plan, '2026-10-19'), ['23:30']);
      for (final item in plan) {
        expect(item.when.hour, lessThan(24));
        expect(
          formatWibDate(item.when),
          item.date,
          reason: 'a reminder must not leak into the next WIB day',
        );
      }
    });

    test('confirmation drops all of today, tomorrow is untouched', () {
      final plan = buildDoseReminderPlan(
        now: tz.TZDateTime(tz.local, 2026, 10, 19, 10, 0),
        windows: const ['06:00', '20:00'],
        horizonDays: 1,
        skipToday: true,
        endDate: DateTime(2027, 12, 31),
        followUpHorizonDays: 1,
      );

      expect(windowsFor(plan, '2026-10-19'), isEmpty);
      expect(windowsFor(plan, '2026-10-20'), contains('23:30'));
    });

    test('respects the shorter follow-up horizon', () {
      final plan = buildDoseReminderPlan(
        now: tz.TZDateTime(tz.local, 2026, 10, 19, 10, 0),
        windows: const ['06:00', '20:00'],
        horizonDays: 3,
        skipToday: false,
        endDate: DateTime(2027, 12, 31),
        followUpHorizonDays: 1,
      );

      expect(windowsFor(plan, '2026-10-21'), ['06:00', '20:00']);
      expect(windowsFor(plan, '2026-10-20'), contains('23:30'));
    });

    test('has no duplicate date/window keys across the horizon', () {
      final plan = buildDoseReminderPlan(
        now: tz.TZDateTime(tz.local, 2026, 10, 19, 0, 0),
        windows: const ['06:00', '20:00'],
        horizonDays: 30,
        skipToday: false,
        endDate: DateTime(2027, 12, 31),
        followUpHorizonDays: 14,
      );

      final keys = plan.map((item) => '${item.date}|${item.window}').toSet();
      expect(keys.length, plan.length);
    });
  });

  group('batas tengah malam snooze', () {
    test('detects a snooze that would cross WIB midnight', () {
      expect(
        snoozeWouldCrossWibMidnight(
          now: tz.TZDateTime(tz.local, 2026, 10, 19, 23, 30),
        ),
        isTrue,
      );
      expect(
        snoozeWouldCrossWibMidnight(
          now: tz.TZDateTime(tz.local, 2026, 10, 19, 23, 29),
        ),
        isFalse,
      );
      expect(
        snoozeWouldCrossWibMidnight(
          now: tz.TZDateTime(tz.local, 2026, 10, 19, 10, 0),
        ),
        isFalse,
      );
    });
  });

  group('suara pengingat 15 detik', () {
    test('channel v3 uses the bundled 15 second raw sound', () {
      expect(doseNotificationChannel.id, 'dose_reminder_v3');
      final sound = doseNotificationChannel.sound;
      expect(sound, isA<RawResourceAndroidNotificationSound>());
      expect(
        (sound! as RawResourceAndroidNotificationSound).sound,
        doseNotificationSound,
      );
    });

    test('the bundled wav really is about 15 seconds long', () async {
      final file = File('android/app/src/main/res/raw/dinar_reminder_15s.wav');
      expect(file.existsSync(), isTrue);

      final data = ByteData.sublistView(await file.readAsBytes());
      final byteRate = data.getUint32(28, Endian.little);
      final dataSize = data.getUint32(40, Endian.little);
      final seconds = dataSize / byteRate;

      expect(seconds, closeTo(15.0, 0.2));
    });

    test('sound is louder without clipping or changing its duration', () async {
      final file = File('android/app/src/main/res/raw/dinar_reminder_15s.wav');
      final data = ByteData.sublistView(await file.readAsBytes());
      final dataSize = data.getUint32(40, Endian.little);
      final samples = dataSize ~/ 2;

      var peak = 0;
      var sumSquares = 0.0;
      for (var i = 0; i < samples; i++) {
        final sample = data.getInt16(44 + i * 2, Endian.little);
        final magnitude = sample.abs();
        if (magnitude > peak) peak = magnitude;
        sumSquares += sample * sample;
      }

      // The previous mix peaked around -12 dBFS. The 1.5x boost must still
      // leave plenty of headroom: louder, but never hard-clipped.
      expect(peak, greaterThan(11000));
      expect(peak, lessThan(32767));
      expect(dataSize / data.getUint32(28, Endian.little), closeTo(15.0, 0.2));
      expect(sumSquares / samples, greaterThan(2500 * 2500));
    });
  });

  group('hitung mundur harian', () {
    test('counts down to the next WIB midnight', () {
      final remaining = wibTimeUntilMidnight(
        tz.TZDateTime(tz.local, 2026, 10, 19, 23, 59, 30),
      );
      expect(remaining, const Duration(seconds: 30));
    });

    test('a new day starts a fresh 24 hours', () {
      final remaining = wibTimeUntilMidnight(
        tz.TZDateTime(tz.local, 2026, 10, 20, 0, 0),
      );
      expect(remaining, const Duration(hours: 24));
    });

    test('handles a month boundary', () {
      final remaining = wibTimeUntilMidnight(
        tz.TZDateTime(tz.local, 2026, 1, 31, 23, 59, 59),
      );
      expect(remaining, const Duration(seconds: 1));
    });

    test('formats the remaining time as HH:MM:SS', () {
      expect(
        formatCountdown(const Duration(hours: 1, minutes: 2, seconds: 3)),
        '01:02:03',
      );
    });
    test('the countdown is hidden until the last reminder window starts', () {
      expect(
        isCountdownVisible(DateTime(2026, 10, 19, 19, 59), '20:00'),
        isFalse,
      );
      expect(
        isCountdownVisible(DateTime(2026, 10, 19, 20, 0), '20:00'),
        isTrue,
      );
      expect(
        isCountdownVisible(DateTime(2026, 10, 19, 21, 0), '20:00'),
        isTrue,
      );
    });

    test('an invalid reminder time never hides the countdown', () {
      expect(
        isCountdownVisible(DateTime(2026, 10, 19, 8, 0), 'not-a-time'),
        isTrue,
      );
    });
  });
}
