import 'package:dinar_tb_patient/models/models.dart';
import 'package:dinar_tb_patient/services/notification_service.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import 'sync_service_retry_test.mocks.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('dexterous.com/flutter/local_notifications');
  late List<int> cancelled;
  late List<String> methods;

  setUpAll(() {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    tzdata.initializeTimeZones();
    tz.setLocalLocation(tz.getLocation('Asia/Jakarta'));
  });

  tearDownAll(() {
    debugDefaultTargetPlatformOverride = null;
  });

  setUp(() {
    cancelled = <int>[];
    methods = <String>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          methods.add(call.method);
          if (call.method == 'cancel') {
            final args = call.arguments as Map<Object?, Object?>;
            cancelled.add(args['id'] as int);
            return null;
          }
          // A confirmation must still cancel by deterministic id when the
          // pending-notification cache cannot be read.
          throw PlatformException(
            code: 'unavailable',
            message: 'pending list unavailable',
          );
        });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test(
    'cancels default-window reminders by id without reading the pending list',
    () async {
      final repository = MockScheduleRepository();
      when(repository.getReminderWindows()).thenReturn([]);
      final service = NotificationService()..setRepository(repository);

      final now = tz.TZDateTime.now(tz.local);
      final today = formatWibDate(now);
      final tomorrow = formatWibDate(now.add(const Duration(days: 1)));

      await service.cancelTodayDoseReminders('t1');

      for (final window in defaultReminderWindows) {
        expect(
          cancelled,
          contains(
            doseNotificationId(
              treatmentId: 't1',
              date: today,
              window: window.start,
            ),
          ),
        );
        expect(
          cancelled,
          isNot(
            contains(
              doseNotificationId(
                treatmentId: 't1',
                date: tomorrow,
                window: window.start,
              ),
            ),
          ),
        );
      }
      expect(cancelled, contains(snoozeNotificationId('t1')));
      expect(methods, isNot(contains('pendingNotificationRequests')));
    },
  );

  test(
    'a reschedule drops snoozes for completed or disabled courses',
    () async {
      final repository = MockScheduleRepository();
      when(repository.getReminderWindows()).thenReturn([]);
      when(repository.isPatientArchived).thenReturn(false);
      final service = NotificationService()..setRepository(repository);
      final now = DateTime.now();

      TreatmentCourse course({
        required String id,
        DateTime? completedAt,
        bool remindersEnabled = true,
      }) => TreatmentCourse(
        id: id,
        patientId: 'patient-1',
        startDate: '2026-10-01',
        initialTargetEndDate: '2027-01-01',
        completedAt: completedAt,
        version: 1,
        reviewDue: false,
        remindersEnabled: remindersEnabled,
      );

      await service.rescheduleAll(
        treatments: [
          course(id: 'done', completedAt: now),
          course(id: 'muted', remindersEnabled: false),
        ],
        schedules: const [],
        reminderWindows: const [],
      );

      expect(cancelled, contains(snoozeNotificationId('done')));
      expect(cancelled, contains(snoozeNotificationId('muted')));
    },
  );

  test(
    'a window change cancels the previous officer-time alarms without the pending cache',
    () async {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
            if (call.method == 'cancel') {
              final args = call.arguments as Map<Object?, Object?>;
              cancelled.add(args['id'] as int);
              return null;
            }
            if (call.method == 'zonedSchedule') return null;
            if (call.method == 'canScheduleExactNotifications') return false;
            if (call.method == 'pendingNotificationRequests') {
              throw PlatformException(
                code: 'unavailable',
                message: 'pending list unavailable',
              );
            }
            return null;
          });

      final repository = MockScheduleRepository();
      when(repository.isPatientArchived).thenReturn(false);
      final service = NotificationService()..setRepository(repository);
      final treatment = TreatmentCourse(
        id: 'officer-time',
        patientId: 'patient-1',
        startDate: '2026-10-01',
        initialTargetEndDate: '2027-04-01',
        version: 1,
        reviewDue: false,
        remindersEnabled: true,
      );
      final now = tz.TZDateTime.now(tz.local);
      final tomorrow = formatWibDate(now.add(const Duration(days: 1)));

      await service.rescheduleAll(
        treatments: [treatment],
        schedules: const [],
        reminderWindows: [
          ReminderWindow(start: '06:00', end: '07:00'),
          ReminderWindow(start: '20:00', end: '21:00'),
        ],
      );
      cancelled.clear();

      await service.rescheduleAll(
        treatments: [treatment],
        schedules: const [],
        reminderWindows: [
          ReminderWindow(start: '08:00', end: '09:00'),
          ReminderWindow(start: '20:00', end: '21:00'),
        ],
      );

      expect(
        cancelled,
        contains(
          doseNotificationId(
            treatmentId: 'officer-time',
            date: tomorrow,
            window: '06:00',
          ),
        ),
      );
      expect(
        cancelled,
        isNot(
          contains(
            doseNotificationId(
              treatmentId: 'officer-time',
              date: tomorrow,
              window: '08:00',
            ),
          ),
        ),
      );
    },
  );

  test(
    'an unreadable pending cache does not block control reminders',
    () async {
      final scheduledPayloads = <String?>[];
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
            if (call.method == 'zonedSchedule') {
              final args = call.arguments as Map<Object?, Object?>;
              scheduledPayloads.add(args['payload'] as String?);
              return null;
            }
            if (call.method == 'canScheduleExactNotifications') return false;
            if (call.method == 'cancel') return null;
            if (call.method == 'pendingNotificationRequests') {
              throw PlatformException(
                code: 'unavailable',
                message: 'pending list unavailable',
              );
            }
            return null;
          });

      final repository = MockScheduleRepository();
      when(repository.isPatientArchived).thenReturn(false);
      final service = NotificationService()..setRepository(repository);
      final treatment = TreatmentCourse(
        id: 'control-test',
        patientId: 'patient-1',
        startDate: '2026-10-01',
        initialTargetEndDate: '2027-04-01',
        version: 1,
        reviewDue: false,
        remindersEnabled: true,
      );
      final now = tz.TZDateTime.now(tz.local);
      final controlDay = formatWibDate(now.add(const Duration(days: 3)));

      await service.rescheduleAll(
        treatments: [treatment],
        schedules: [
          ControlSchedule(
            treatmentCourseId: treatment.id,
            scheduledDate: controlDay,
            version: 1,
          ),
        ],
        reminderWindows: [
          ReminderWindow(start: '06:00', end: '07:00'),
          ReminderWindow(start: '20:00', end: '21:00'),
        ],
      );

      expect(service.hasReminderSchedulingFailure, isFalse);
      expect(
        scheduledPayloads.where(
          (payload) => payload?.contains('"type":"control_reminder"') ?? false,
        ),
        isNotEmpty,
      );
    },
  );
}
