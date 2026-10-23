// Tests for the dose reminder plan, snooze identity and WIB date handling.
// These are pure tests: no Android device or notification plugin is required.

import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;
import 'package:dinar_tb_patient/services/notification_service.dart';

void main() {
  late tz.TZDateTime now;

  setUpAll(() {
    tzdata.initializeTimeZones();
    tz.setLocalLocation(tz.getLocation('Asia/Jakarta'));
    now = tz.TZDateTime(tz.local, 2026, 10, 19, 10, 0);
  });

  group('pengingat pagi', () {
    test('follows the officer-set morning window', () {
      final plan = buildDoseReminderPlan(
        now: tz.TZDateTime(tz.local, 2026, 10, 19, 5, 0),
        windows: const ['06:00', '20:00'],
        horizonDays: 0,
        skipToday: false,
        endDate: DateTime(2027, 12, 31),
      );

      expect(plan.length, 2);
      expect(plan[0].date, '2026-10-19');
      expect(plan[0].window, '06:00');
      expect(plan[0].when.hour, 6);
      expect(plan[0].when.minute, 0);
      expect(plan[1].window, '20:00');
    });

    test('is independent of the control schedule', () {
      // The plan only uses reminder windows; no schedule/end-of-treatment object
      // is involved, so a treatment without a control visit still gets doses.
      final plan = buildDoseReminderPlan(
        now: now,
        windows: const ['06:00'],
        horizonDays: 2,
        skipToday: false,
        endDate: DateTime(2027, 12, 31),
      );
      expect(plan.map((item) => item.date), ['2026-10-20', '2026-10-21']);
    });
  });

  group('pengingat malam', () {
    test('is scheduled when the date is not confirmed yet', () {
      final plan = buildDoseReminderPlan(
        now: now,
        windows: const ['06:00', '20:00'],
        horizonDays: 0,
        skipToday: false,
        endDate: DateTime(2027, 12, 31),
      );

      expect(plan.any((item) => item.date == '2026-10-19'), isTrue);
      expect(
        plan.where((item) => item.date == '2026-10-19').map((e) => e.window),
        ['20:00'],
      );
    });

    test('is cancelled for today after confirmation, tomorrow is kept', () {
      final plan = buildDoseReminderPlan(
        now: now,
        windows: const ['06:00', '20:00'],
        horizonDays: 1,
        skipToday: true,
        endDate: DateTime(2027, 12, 31),
      );

      expect(plan.any((item) => item.date == '2026-10-19'), isFalse);
      expect(
        plan.where((item) => item.date == '2026-10-20').map((e) => e.window),
        ['06:00', '20:00'],
      );
    });
  });

  group('tunda 30 menit', () {
    test('schedules the same reminder 30 minutes later', () {
      final plan = buildSnoozePlan(
        now: tz.TZDateTime(tz.local, 2026, 10, 19, 10, 0),
        treatmentId: 't1',
      );

      expect(plan.when, tz.TZDateTime(tz.local, 2026, 10, 19, 10, 30));
      expect(plan.payload, contains('"type":"dose_reminder"'));
      expect(plan.payload, contains('"window":"snooze"'));
      expect(plan.payload, contains('"treatmentId":"t1"'));
    });

    test('honours a custom delay and has a stable id', () {
      final first = buildSnoozePlan(
        now: now,
        treatmentId: 't1',
        delay: const Duration(minutes: 30),
      );
      final second = buildSnoozePlan(
        now: now,
        treatmentId: 't1',
        delay: const Duration(minutes: 30),
      );

      expect(first.when.difference(now), const Duration(minutes: 30));
      expect(first.id, second.id);
    });

    test('keeps the same id when snoozed again later', () {
      final first = buildSnoozePlan(
        now: now,
        treatmentId: 't1',
        delay: const Duration(minutes: 30),
      );
      final again = buildSnoozePlan(
        now: now.add(const Duration(minutes: 5)),
        treatmentId: 't1',
        delay: const Duration(minutes: 30),
      );

      expect(first.id, snoozeNotificationId('t1'));
      expect(again.id, first.id);
      expect(
        snoozeNotificationId('t2'),
        isNot(first.id),
        reason: 'different treatments must not cancel each other',
      );
    });
  });

  group('aksi notifikasi', () {
    test('dose notifications expose the snooze action button', () {
      final actions = doseNotificationDetails.android!.actions!;
      final snooze = actions.singleWhere((a) => a.id == snoozeActionId);

      expect(snooze.title, 'Ingatkan dalam 30 menit lagi');
      expect(snooze.cancelNotification, isTrue);
      expect(snooze.showsUserInterface, isFalse);
    });

    test('the snooze action schedules a new reminder', () async {
      final payloads = <String?>[];
      final original = snoozeScheduleAction;
      snoozeScheduleAction = (payload) async {
        payloads.add(payload);
        return true;
      };
      addTearDown(() => snoozeScheduleAction = original);

      await notificationBackgroundResponseHandler(
        const NotificationResponse(
          notificationResponseType:
              NotificationResponseType.selectedNotificationAction,
          actionId: snoozeActionId,
          payload:
              '{"type":"dose_reminder","treatmentId":"t1","window":"snooze"}',
        ),
      );

      expect(payloads, [
        '{"type":"dose_reminder","treatmentId":"t1","window":"snooze"}',
      ]);
    });

    test('a non-snooze notification tap does not schedule anything', () async {
      final payloads = <String?>[];
      final original = snoozeScheduleAction;
      snoozeScheduleAction = (payload) async {
        payloads.add(payload);
        return true;
      };
      addTearDown(() => snoozeScheduleAction = original);

      await notificationBackgroundResponseHandler(
        const NotificationResponse(
          notificationResponseType:
              NotificationResponseType.selectedNotification,
          payload: '{"type":"dose_reminder","treatmentId":"t1"}',
        ),
      );

      expect(payloads, isEmpty);
    });

    test('a failed background snooze reports a visible failure', () async {
      final originalSchedule = snoozeScheduleAction;
      final originalReporter = snoozeFailureReporter;
      final messages = <String>[];
      snoozeScheduleAction = (_) async => false;
      snoozeFailureReporter = (message) async => messages.add(message);
      addTearDown(() {
        snoozeScheduleAction = originalSchedule;
        snoozeFailureReporter = originalReporter;
      });

      await notificationBackgroundResponseHandler(
        const NotificationResponse(
          notificationResponseType:
              NotificationResponseType.selectedNotificationAction,
          actionId: snoozeActionId,
          payload:
              '{"type":"dose_reminder","treatmentId":"t1","window":"snooze"}',
        ),
      );

      expect(messages, hasLength(1));
      expect(messages.single, contains('belum bisa dijadwalkan'));
      expect(messages.single.toLowerCase(), isNot(contains('izin')));
    });

    test('an exception while scheduling is reported, not swallowed', () async {
      final originalSchedule = snoozeScheduleAction;
      final originalReporter = snoozeFailureReporter;
      final messages = <String>[];
      snoozeScheduleAction = (_) async => throw Exception('alarm error');
      snoozeFailureReporter = (message) async => messages.add(message);
      addTearDown(() {
        snoozeScheduleAction = originalSchedule;
        snoozeFailureReporter = originalReporter;
      });

      await notificationBackgroundResponseHandler(
        const NotificationResponse(
          notificationResponseType:
              NotificationResponseType.selectedNotificationAction,
          actionId: snoozeActionId,
          payload:
              '{"type":"dose_reminder","treatmentId":"t1","window":"snooze"}',
        ),
      );

      expect(messages, hasLength(1));
    });

    test('a pending-cache miss is not reported as a failed snooze', () async {
      final originalSchedule = snoozeScheduleAction;
      final originalReporter = snoozeFailureReporter;
      var reported = false;
      snoozeScheduleAction = (_) async => true;
      snoozeFailureReporter = (_) async => reported = true;
      addTearDown(() {
        snoozeScheduleAction = originalSchedule;
        snoozeFailureReporter = originalReporter;
      });

      await notificationBackgroundResponseHandler(
        const NotificationResponse(
          notificationResponseType:
              NotificationResponseType.selectedNotificationAction,
          actionId: snoozeActionId,
          payload:
              '{"type":"dose_reminder","treatmentId":"t1","window":"snooze"}',
        ),
      );

      expect(reported, isFalse);
    });

    test(
      'failure text mentions permission only for an exact-alarm rejection',
      () {
        final exactAlarm = snoozeFailurePatientMessage(
          PlatformException(code: 'exact_alarms_not_permitted'),
        );
        final otherPlatform = snoozeFailurePatientMessage(
          PlatformException(code: 'status_error'),
        );
        final registration = snoozeFailurePatientMessage(
          StateError('Android did not register the snooze alarm.'),
        );

        expect(exactAlarm, contains('izin'));
        expect(otherPlatform.toLowerCase(), isNot(contains('izin')));
        expect(registration.toLowerCase(), isNot(contains('izin')));
      },
    );

    test('diagnostics keep the concrete failure separate from warnings', () {
      SnoozeDiagnostics.reset();
      SnoozeDiagnostics.recordWarning(
        'background-pending-cache',
        StateError('cache lag'),
      );

      expect(SnoozeDiagnostics.lastFailure, isNull);
      expect(
        SnoozeDiagnostics.lastWarning,
        contains('background-pending-cache'),
      );
      expect(SnoozeDiagnostics.lastWarning, contains('cache lag'));

      SnoozeDiagnostics.recordFailure(
        'background-schedule',
        TimeoutException('platform timeout'),
      );

      expect(SnoozeDiagnostics.lastFailure, contains('background-schedule'));
      expect(SnoozeDiagnostics.lastFailure, contains('TimeoutException'));
      expect(SnoozeDiagnostics.lastWarning, isNotNull);

      SnoozeDiagnostics.reset();
      expect(SnoozeDiagnostics.lastFailure, isNull);
      expect(SnoozeDiagnostics.lastWarning, isNull);
    });

    test('a successful background snooze does not report a failure', () async {
      final originalSchedule = snoozeScheduleAction;
      final originalReporter = snoozeFailureReporter;
      var reported = false;
      snoozeScheduleAction = (_) async => true;
      snoozeFailureReporter = (_) async => reported = true;
      addTearDown(() {
        snoozeScheduleAction = originalSchedule;
        snoozeFailureReporter = originalReporter;
      });

      await notificationBackgroundResponseHandler(
        const NotificationResponse(
          notificationResponseType:
              NotificationResponseType.selectedNotificationAction,
          actionId: snoozeActionId,
          payload:
              '{"type":"dose_reminder","treatmentId":"t1","window":"snooze"}',
        ),
      );

      expect(reported, isFalse);
    });

    test('a hanging permission probe does not block snoozing', () async {
      final never = Completer<bool>();

      final enabled = await notificationsEnabledForSnooze(
        () => never.future,
        timeout: const Duration(milliseconds: 20),
      );

      expect(enabled, isTrue);
    });

    test('a failing permission probe defaults to trying the snooze', () async {
      final enabled = await notificationsEnabledForSnooze(
        () async => throw Exception('channel unavailable'),
      );

      expect(enabled, isTrue);
    });
  });

  group('pemulihan jadwal', () {
    test('notification ids are deterministic across reschedules', () {
      final a = doseNotificationId(
        treatmentId: 't1',
        date: '2026-10-20',
        window: '06:00',
      );
      final b = doseNotificationId(
        treatmentId: 't1',
        date: '2026-10-20',
        window: '06:00',
      );
      final otherDay = doseNotificationId(
        treatmentId: 't1',
        date: '2026-10-21',
        window: '06:00',
      );

      expect(a, b);
      expect(a, isNot(otherDay));
    });

    test('rebuilding the plan keeps every future date', () {
      final first = buildDoseReminderPlan(
        now: now,
        windows: const ['06:00', '20:00'],
        horizonDays: 2,
        skipToday: false,
        endDate: DateTime(2027, 12, 31),
      );
      final rebuilt = buildDoseReminderPlan(
        now: now,
        windows: const ['06:00', '20:00'],
        horizonDays: 2,
        skipToday: false,
        endDate: DateTime(2027, 12, 31),
      );

      final firstKeys = first.map((e) => '${e.date}|${e.window}').toList();
      final rebuiltKeys = rebuilt.map((e) => '${e.date}|${e.window}').toList();
      expect(rebuiltKeys, firstKeys);
      expect(firstKeys, contains('2026-10-21|20:00'));
    });

    test('covers the full rolling horizon without duplicates', () {
      final plan = buildDoseReminderPlan(
        now: tz.TZDateTime(tz.local, 2026, 10, 19, 0, 0),
        windows: const ['06:00', '20:00'],
        horizonDays: 60,
        skipToday: false,
        endDate: DateTime(2027, 12, 31),
      );

      // 61 days * 2 windows.
      expect(plan.length, 122);
      final keys = plan.map((item) => '${item.date}|${item.window}').toSet();
      expect(keys.length, plan.length);
      expect(plan.last.date, '2026-12-18');
    });

    test('weekly maintenance always adds a fresh 60-day tail', () {
      final launched = buildDoseReminderPlan(
        now: tz.TZDateTime(tz.local, 2026, 10, 19, 0, 0),
        windows: const ['06:00', '20:00'],
        horizonDays: 60,
        skipToday: false,
        endDate: DateTime(2027, 12, 31),
      );
      // A weekly run one week later must extend the last date by exactly a week
      // instead of letting the 60-day horizon shrink.
      final maintained = buildDoseReminderPlan(
        now: tz.TZDateTime(tz.local, 2026, 10, 26, 0, 0),
        windows: const ['06:00', '20:00'],
        horizonDays: 60,
        skipToday: false,
        endDate: DateTime(2027, 12, 31),
      );

      expect(launched.last.date, '2026-12-18');
      expect(maintained.last.date, '2026-12-25');
      expect(maintained.any((item) => item.date == '2026-12-19'), isTrue);
    });

    test('does not schedule past the treatment end date', () {
      final plan = buildDoseReminderPlan(
        now: now,
        windows: const ['20:00'],
        horizonDays: 60,
        skipToday: false,
        endDate: DateTime(2026, 10, 21),
      );

      expect(plan.map((item) => item.date).toList(), [
        '2026-10-19',
        '2026-10-20',
      ]);
    });
  });

  group('pergantian tanggal WIB', () {
    test('uses the Jakarta calendar date on both sides of midnight', () {
      final beforeMidnight = tz.TZDateTime(tz.local, 2026, 10, 19, 23, 59);
      final afterMidnight = tz.TZDateTime(tz.local, 2026, 10, 20, 0, 0);

      expect(formatWibDate(beforeMidnight), '2026-10-19');
      expect(formatWibDate(afterMidnight), '2026-10-20');
    });

    test('the new day gets its own reminders after midnight', () {
      final lateNight = buildDoseReminderPlan(
        now: tz.TZDateTime(tz.local, 2026, 10, 19, 23, 59),
        windows: const ['06:00', '20:00'],
        horizonDays: 0,
        skipToday: false,
        endDate: DateTime(2027, 12, 31),
      );
      final nextMorning = buildDoseReminderPlan(
        now: tz.TZDateTime(tz.local, 2026, 10, 20, 0, 0),
        windows: const ['06:00', '20:00'],
        horizonDays: 0,
        skipToday: false,
        endDate: DateTime(2027, 12, 31),
      );

      expect(lateNight, isEmpty);
      expect(nextMorning.map((e) => '${e.date}|${e.window}'), [
        '2026-10-20|06:00',
        '2026-10-20|20:00',
      ]);
    });

    test('a snooze crossing midnight lands on the next WIB date', () {
      final plan = buildSnoozePlan(
        now: tz.TZDateTime(tz.local, 2026, 10, 19, 23, 45),
        treatmentId: 't1',
      );

      expect(formatWibDate(plan.when), '2026-10-20');
      expect(plan.when.hour, 0);
      expect(plan.when.minute, 15);
    });
  });
}
