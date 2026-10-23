// Tests for the reminder configuration flow:
//  - reminder windows are persisted as a REPLACE (no stale/duplicate times)
//  - an empty/failed payload never wipes the last applied schedule
//  - a successful sync applies the new windows and reschedules notifications
//  - an offline (re)start keeps the last successfully applied windows

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mockito/mockito.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dinar_tb_patient/models/models.dart';
import 'package:dinar_tb_patient/repositories/schedule_repository.dart';
import 'package:dinar_tb_patient/services/sync_service.dart';

import 'sync_service_retry_test.mocks.dart';

void main() {
  late Directory tempDir;

  setUpAll(() async {
    tempDir = await Directory.systemTemp.createTemp('dinar_reminder_test');
    Hive.init(tempDir.path);
    Hive.registerAdapter(PatientAdapter());
    Hive.registerAdapter(TreatmentCourseAdapter());
    Hive.registerAdapter(ControlScheduleAdapter());
    Hive.registerAdapter(ReminderWindowAdapter());
    Hive.registerAdapter(AdherenceOperationAdapter());
    Hive.registerAdapter(AdherenceOperationStatusAdapter());
  });

  tearDownAll(() async {
    await Hive.close();
    await tempDir.delete(recursive: true);
  });

  final patient = Patient(
    id: 'p1',
    fullName: 'Budi',
    registerNumber: 'REG1',
    address: 'Jl. Uji',
    version: 1,
  );

  final treatment = TreatmentCourse(
    id: 't1',
    patientId: 'p1',
    startDate: '2026-10-01',
    initialTargetEndDate: '2027-04-01',
    version: 1,
    reviewDue: false,
    remindersEnabled: true,
  );

  final schedule = ControlSchedule(
    treatmentCourseId: 't1',
    scheduledDate: '2026-10-20',
    version: 1,
  );

  List<ReminderWindow> windows(String morning) => [
    ReminderWindow(start: morning, end: _plusHour(morning)),
    ReminderWindow(start: '20:00', end: '21:00'),
  ];

  SyncResponse responseWith(List<ReminderWindow> reminderWindows) =>
      SyncResponse(
        patient: patient,
        treatmentCourses: [treatment],
        controlSchedules: [schedule],
        reminderWindows: reminderWindows,
        serverTime: DateTime.now().toIso8601String(),
        hasMore: false,
        maxVersion: 7,
      );

  group('ScheduleRepository reminder windows', () {
    late ScheduleRepository repository;

    setUp(() async {
      repository = ScheduleRepository();
      await repository.init();
      await repository.clearAll();
    });

    test('saving a new set replaces the old one (06:00 -> 08:00)', () async {
      await repository.saveReminderWindows(windows('06:00'));
      await repository.saveReminderWindows(windows('08:00'));

      final starts =
          repository.getReminderWindows().map((w) => w.start).toList()..sort();

      expect(starts, ['08:00', '20:00']);
      expect(starts, isNot(contains('06:00')));
    });

    test('an empty payload never wipes the last applied windows', () async {
      await repository.saveReminderWindows(windows('06:00'));
      await repository.saveReminderWindows([]);

      final starts = repository
          .getReminderWindows()
          .map((w) => w.start)
          .toSet();
      expect(starts, {'06:00', '20:00'});
    });

    test('windows persist across a repository restart', () async {
      await repository.saveReminderWindows(windows('08:00'));

      final reopened = ScheduleRepository();
      await reopened.init();

      final starts = reopened.getReminderWindows().map((w) => w.start).toSet();
      expect(starts, {'08:00', '20:00'});
    });
  });

  group('SyncService reminder propagation', () {
    late MockApiClient apiClient;
    late MockNotificationService notificationService;
    late MockConnectivity connectivity;
    late ScheduleRepository repository;

    setUp(() async {
      apiClient = MockApiClient();
      notificationService = MockNotificationService();
      connectivity = MockConnectivity();
      repository = ScheduleRepository();
      await repository.init();
      await repository.clearAll();

      await repository.savePatient(patient);
      await repository.saveTreatment(treatment);
      await repository.saveSchedule(schedule);
    });

    test('a successful sync stores the new windows and reschedules', () async {
      when(
        connectivity.checkConnectivity(),
      ).thenAnswer((_) async => [ConnectivityResult.wifi]);
      when(
        connectivity.onConnectivityChanged,
      ).thenAnswer((_) => Stream.value([ConnectivityResult.wifi]));

      final queue = <SyncResponse>[
        responseWith(windows('06:00')),
        responseWith(windows('08:00')),
      ];
      when(
        apiClient.sync(
          sinceVersion: anyNamed('sinceVersion'),
          sinceScheduleVersion: anyNamed('sinceScheduleVersion'),
          sinceTimestamp: anyNamed('sinceTimestamp'),
          limit: anyNamed('limit'),
          offset: anyNamed('offset'),
        ),
      ).thenAnswer((_) async => queue.removeAt(0));

      final service = SyncService(
        apiClient: apiClient,
        repository: repository,
        notificationService: notificationService,
        connectivity: connectivity,
      );

      // Initial full sync (06:00) then the admin change observed on next sync.
      await service.init();
      clearInteractions(notificationService);

      await service.forceSync();

      final stored = repository.getReminderWindows();
      expect(stored.map((w) => w.start).toSet(), {'08:00', '20:00'});
      expect(stored.map((w) => w.start), isNot(contains('06:00')));

      verify(
        notificationService.rescheduleAll(
          treatments: anyNamed('treatments'),
          schedules: anyNamed('schedules'),
          reminderWindows: argThat(
            predicate<List<ReminderWindow>>(
              (list) =>
                  list.length == 2 &&
                  list.map((w) => w.start).toSet().containsAll({
                    '08:00',
                    '20:00',
                  }),
            ),
            named: 'reminderWindows',
          ),
        ),
      ).called(greaterThanOrEqualTo(1));

      service.dispose();
    });

    test('offline restart keeps the last applied windows', () async {
      when(
        connectivity.checkConnectivity(),
      ).thenAnswer((_) async => [ConnectivityResult.none]);
      when(
        connectivity.onConnectivityChanged,
      ).thenAnswer((_) => Stream.value([ConnectivityResult.none]));

      await repository.saveReminderWindows(windows('08:00'));

      final service = SyncService(
        apiClient: apiClient,
        repository: repository,
        notificationService: notificationService,
        connectivity: connectivity,
      );

      await service.init();

      expect(repository.getReminderWindows().map((w) => w.start).toSet(), {
        '08:00',
        '20:00',
      });

      verify(
        notificationService.rescheduleAll(
          treatments: anyNamed('treatments'),
          schedules: anyNamed('schedules'),
          reminderWindows: argThat(
            predicate<List<ReminderWindow>>(
              (list) => list.map((w) => w.start).toSet().containsAll({
                '08:00',
                '20:00',
              }),
            ),
            named: 'reminderWindows',
          ),
        ),
      ).called(greaterThanOrEqualTo(1));

      service.dispose();
    });
  });
}

String _plusHour(String hhmm) {
  final parts = hhmm.split(':');
  final hour = (int.parse(parts[0]) + 1) % 24;
  return '${hour.toString().padLeft(2, '0')}:${parts[1]}';
}
