// Regression tests for the "Uji Notifikasi Terjadwal 1 Menit" action. Success
// must be reported only after Android registered the alarm, and the test must
// not leave duplicate alarms behind.
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import 'package:dinar_tb_patient/models/models.dart';
import 'package:dinar_tb_patient/services/notification_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('dexterous.com/flutter/local_notifications');
  const testId = 900002;
  late Map<Object?, Object?>? scheduled;
  late List<int> cancelled;
  late bool registerAlarm;
  late List<Map<String, Object?>> pendingAlarms;
  late int zonedCalls;

  setUpAll(() {
    // The plugin instance chooses its platform implementation at construction.
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    tzdata.initializeTimeZones();
    tz.setLocalLocation(tz.getLocation('Asia/Jakarta'));
  });

  tearDownAll(() {
    debugDefaultTargetPlatformOverride = null;
  });

  setUp(() {
    scheduled = null;
    cancelled = <int>[];
    registerAlarm = true;
    pendingAlarms = <Map<String, Object?>>[];
    zonedCalls = 0;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          if (call.method == 'cancel') {
            final args = call.arguments;
            if (args is int) {
              cancelled.add(args);
              pendingAlarms.removeWhere((item) => item['id'] == args);
            } else if (args is Map && args['id'] is int) {
              final id = args['id'] as int;
              cancelled.add(id);
              pendingAlarms.removeWhere((item) => item['id'] == id);
            }
            return null;
          }
          if (call.method == 'zonedSchedule') {
            scheduled = call.arguments as Map<Object?, Object?>;
            zonedCalls++;
            if (registerAlarm) {
              pendingAlarms.add(<String, Object?>{
                'id': scheduled!['id'],
                'title': scheduled!['title'],
                'body': scheduled!['body'],
                'payload': scheduled!['payload'],
              });
            }
            return null;
          }
          if (call.method == 'pendingNotificationRequests') {
            return pendingAlarms;
          }
          return null;
        });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('schedules one unique local alarm about one minute ahead', () async {
    final service = NotificationService();

    await service.scheduleTestNotification();

    expect(scheduled, isNotNull);
    expect(scheduled!['id'], testId);
    expect(scheduled!['timeZoneName'], 'Asia/Jakarta');

    final scheduledWallTime = DateTime.parse(
      scheduled!['scheduledDateTime'] as String,
    );
    final expected = tz.TZDateTime.now(
      tz.local,
    ).add(const Duration(minutes: 1));
    final expectedWallTime = DateTime(
      expected.year,
      expected.month,
      expected.day,
      expected.hour,
      expected.minute,
      expected.second,
    );
    expect(
      scheduledWallTime.difference(expectedWallTime).inSeconds.abs(),
      lessThan(5),
    );

    // A second tap replaces the same ID instead of stacking another alarm.
    await service.scheduleTestNotification();
    expect(await service.pendingNotificationCount(), 1);
    expect(scheduled!['id'], testId);
  });

  test('force replaces alarms that Android already lists', () async {
    final endDate = DateTime.now().add(const Duration(days: 365));
    final treatment = TreatmentCourse(
      id: 't-force',
      patientId: 'p1',
      startDate: '2026-01-01',
      initialTargetEndDate: '2027-01-01',
      version: 1,
      reviewDue: false,
      remindersEnabled: true,
    );
    final windows = <ReminderWindow>[
      ReminderWindow(start: '06:00', end: '07:00'),
    ];
    final plan = buildDoseReminderPlan(
      now: tz.TZDateTime.now(tz.local),
      windows: windows.map((window) => window.start).toList(),
      horizonDays: 60,
      skipToday: false,
      endDate: endDate,
      followUpHorizonDays: 14,
      followUpInterval: const Duration(minutes: 30),
      followUpLastTime: '23:30',
    );
    expect(plan, isNotEmpty);

    pendingAlarms = [
      for (final item in plan)
        <String, Object?>{
          'id': doseNotificationId(
            treatmentId: treatment.id,
            date: item.date,
            window: item.window,
          ),
          'title': '',
          'body': '',
          'payload': '',
        },
    ];

    final service = NotificationService();
    await service.scheduleDoseReminders(
      treatment: treatment,
      schedule: null,
      reminderWindows: windows,
    );
    expect(zonedCalls, 0);

    await service.scheduleDoseReminders(
      treatment: treatment,
      schedule: null,
      reminderWindows: windows,
      force: true,
    );
    expect(zonedCalls, plan.length);
  });

  test(
    'throws and cleans up when Android does not register the alarm',
    () async {
      registerAlarm = false;
      final service = NotificationService();

      await expectLater(
        service.scheduleTestNotification(),
        throwsA(isA<StateError>()),
      );

      // Once before scheduling and once when verification fails.
      expect(cancelled.where((id) => id == testId).length, 2);
    },
  );
}
