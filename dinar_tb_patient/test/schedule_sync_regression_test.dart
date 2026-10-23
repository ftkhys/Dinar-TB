// Regression tests for control-schedule synchronisation:
//
//  - C-1: an incremental sync that carries no treatment course (e.g. a
//    schedule-only change, or the sync triggered right after a medicine
//    confirmation) must never wipe the local schedule cache.
//  - C-1: a schedule-only change is applied to the local cache.
//  - C-2: a medicine confirmation that triggers an incremental sync keeps the
//    Jadwal tab populated and reschedules notifications with the schedule.
//  - C-4: a paginated full sync accumulates active course ids across pages, so
//    schedules from an earlier page are not pruned when a later page arrives.
//  - C-1: a full sync is authoritative and may safely prune stale schedules.

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
    tempDir = await Directory.systemTemp.createTemp('dinar_schedule_sync_test');
    Hive.init(tempDir.path);
    Hive.registerAdapter(PatientAdapter());
    Hive.registerAdapter(TreatmentCourseAdapter());
    Hive.registerAdapter(ControlScheduleAdapter());
    Hive.registerAdapter(ReminderWindowAdapter());
    Hive.registerAdapter(AdherenceOperationAdapter());
    Hive.registerAdapter(AdherenceOperationStatusAdapter());
    Hive.registerAdapter(VisitRecordAdapter());
    Hive.registerAdapter(AdherenceHistoryAdapter());
    Hive.registerAdapter(AdherenceDayAdapter());
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

  TreatmentCourse activeCourse(String id) => TreatmentCourse(
    id: id,
    patientId: 'p1',
    startDate: '2026-10-01',
    initialTargetEndDate: '2027-04-01',
    version: 1,
    reviewDue: false,
    remindersEnabled: true,
  );

  ControlSchedule schedule(String courseId, String date, {int version = 1}) =>
      ControlSchedule(
        treatmentCourseId: courseId,
        scheduledDate: date,
        version: version,
      );

  SyncResponse response({
    List<TreatmentCourse>? courses,
    List<ControlSchedule>? schedules,
    bool hasMore = false,
    int maxVersion = 0,
    int maxScheduleVersion = 0,
    String? serverTime,
  }) => SyncResponse(
    patient: patient,
    treatmentCourses: courses ?? const [],
    controlSchedules: schedules ?? const [],
    reminderWindows: const [],
    serverTime: serverTime ?? DateTime.now().toIso8601String(),
    hasMore: hasMore,
    maxVersion: maxVersion,
    maxScheduleVersion: maxScheduleVersion,
  );

  PatientProgress emptyProgress() => PatientProgress(
    visits: const [],
    adherence: null,
    serverTime: DateTime.now().toIso8601String(),
  );

  late MockApiClient api;
  late MockNotificationService notifications;
  late MockConnectivity connectivity;
  late ScheduleRepository repository;
  late SyncService service;

  setUp(() async {
    api = MockApiClient();
    notifications = MockNotificationService();
    connectivity = MockConnectivity();
    repository = ScheduleRepository();
    await repository.init();
    await repository.clearAll();

    when(
      connectivity.checkConnectivity(),
    ).thenAnswer((_) async => [ConnectivityResult.wifi]);
    when(
      connectivity.onConnectivityChanged,
    ).thenAnswer((_) => Stream.value([ConnectivityResult.wifi]));
    when(api.getProgress()).thenAnswer((_) async => emptyProgress());

    service = SyncService(
      apiClient: api,
      repository: repository,
      notificationService: notifications,
      connectivity: connectivity,
    );
  });

  tearDown(() async {
    service.dispose();
    await repository.clearAll();
    await Hive.deleteBoxFromDisk('adherence_queue');
  });

  test(
    'incremental sync without treatment changes keeps local schedules (C-1)',
    () async {
      await repository.saveTreatment(activeCourse('t1'));
      await repository.saveSchedule(schedule('t1', '2026-11-01'));
      await repository.setMaxVersion(1);
      await repository.setMaxScheduleVersion(1);

      // Delta carries neither a course nor a schedule: absence means "unchanged".
      when(
        api.sync(
          sinceVersion: anyNamed('sinceVersion'),
          sinceScheduleVersion: anyNamed('sinceScheduleVersion'),
          sinceTimestamp: anyNamed('sinceTimestamp'),
          limit: anyNamed('limit'),
          offset: anyNamed('offset'),
        ),
      ).thenAnswer((_) async => response());

      await service.incrementalSync();

      expect(
        repository.getSchedule('t1'),
        isNotNull,
        reason: 'an empty incremental delta must not delete local schedules',
      );
      expect(repository.getSchedule('t1')!.scheduledDate, '2026-11-01');
    },
  );

  test(
    'incremental sync sends and advances the server timestamp cursor',
    () async {
      await repository.setMaxSyncTimestamp('2026-10-21T03:00:00.000Z');

      when(
        api.sync(
          sinceVersion: anyNamed('sinceVersion'),
          sinceScheduleVersion: anyNamed('sinceScheduleVersion'),
          sinceTimestamp: '2026-10-21T03:00:00.000Z',
          limit: anyNamed('limit'),
          offset: anyNamed('offset'),
        ),
      ).thenAnswer(
        (_) async => response(serverTime: '2026-10-21T03:05:00.000Z'),
      );

      await service.incrementalSync();

      expect(
        repository.getMaxSyncTimestamp(),
        '2026-10-21T03:05:00.000Z',
        reason:
            'the next sync must resume from the server clock, not a row version',
      );
    },
  );

  test('a schedule-only change is applied to the local cache (C-1)', () async {
    await repository.saveTreatment(activeCourse('t1'));
    await repository.saveSchedule(schedule('t1', '2026-11-01'));
    await repository.setMaxVersion(1);
    await repository.setMaxScheduleVersion(1);

    when(
      api.sync(
        sinceVersion: anyNamed('sinceVersion'),
        sinceScheduleVersion: anyNamed('sinceScheduleVersion'),
        sinceTimestamp: anyNamed('sinceTimestamp'),
        limit: anyNamed('limit'),
        offset: anyNamed('offset'),
      ),
    ).thenAnswer(
      (_) async => response(
        schedules: [schedule('t1', '2026-12-15', version: 2)],
        maxScheduleVersion: 2,
      ),
    );

    await service.incrementalSync();

    expect(repository.getSchedule('t1')!.scheduledDate, '2026-12-15');
  });

  test(
    'medicine confirmation that triggers an incremental sync keeps the Jadwal tab '
    'and reschedules with the schedule (C-1/C-2)',
    () async {
      await repository.saveTreatment(activeCourse('t1'));
      await repository.saveSchedule(schedule('t1', '2026-11-01'));

      // First sync (init full sync) returns the real course + schedule; the
      // post-confirmation incremental sync returns an empty delta.
      final responses = <SyncResponse>[
        response(
          courses: [activeCourse('t1')],
          schedules: [schedule('t1', '2026-11-01')],
          maxVersion: 1,
          maxScheduleVersion: 1,
        ),
        response(),
      ];
      when(
        api.sync(
          sinceVersion: anyNamed('sinceVersion'),
          sinceScheduleVersion: anyNamed('sinceScheduleVersion'),
          sinceTimestamp: anyNamed('sinceTimestamp'),
          limit: anyNamed('limit'),
          offset: anyNamed('offset'),
        ),
      ).thenAnswer((_) async => responses.removeAt(0));

      await service.init();
      clearInteractions(notifications);

      when(
        api.confirmAdherenceOnline(
          treatmentId: anyNamed('treatmentId'),
          operationId: anyNamed('operationId'),
          adherenceDate: anyNamed('adherenceDate'),
          confirmedAt: anyNamed('confirmedAt'),
          expectedTreatmentVersion: anyNamed('expectedTreatmentVersion'),
        ),
      ).thenAnswer((_) async => {'code': 'APPLIED'});

      await service.enqueueAdherenceOperation(
        AdherenceOperation(
          operationId: 'op-1',
          treatmentCourseId: 't1',
          adherenceDate: '2026-10-05',
          confirmedAt: DateTime.now().toUtc().toIso8601String(),
          expectedTreatmentVersion: 1,
          createdAt: DateTime.now(),
        ),
      );

      expect(
        repository.getSchedule('t1'),
        isNotNull,
        reason: 'confirming medicine must not empty the Jadwal tab',
      );
      verify(
        notifications.rescheduleAll(
          treatments: anyNamed('treatments'),
          schedules: argThat(
            predicate<List<ControlSchedule>>(
              (list) => list.any((s) => s.treatmentCourseId == 't1'),
            ),
            named: 'schedules',
          ),
          reminderWindows: anyNamed('reminderWindows'),
        ),
      ).called(greaterThanOrEqualTo(1));
    },
  );

  test(
    'incremental sync drops the upcoming control card of a completed course',
    () async {
      await repository.saveTreatment(activeCourse('t1'));
      await repository.saveSchedule(schedule('t1', '2026-11-01'));
      await repository.setMaxVersion(1);
      await repository.setMaxScheduleVersion(1);

      final completed = TreatmentCourse(
        id: 't1',
        patientId: 'p1',
        startDate: '2026-10-01',
        initialTargetEndDate: '2027-04-01',
        finalDecision: 'COMPLETED',
        finalReviewedAt: DateTime.utc(2027, 4, 1),
        completedAt: DateTime.utc(2027, 4, 1),
        version: 2,
        reviewDue: false,
        remindersEnabled: false,
        displayMessage: 'Pengobatan selesai.',
      );
      when(
        api.sync(
          sinceVersion: anyNamed('sinceVersion'),
          sinceScheduleVersion: anyNamed('sinceScheduleVersion'),
          sinceTimestamp: anyNamed('sinceTimestamp'),
          limit: anyNamed('limit'),
          offset: anyNamed('offset'),
        ),
      ).thenAnswer((_) async => response(courses: [completed], maxVersion: 2));

      await service.incrementalSync();

      expect(
        repository.getSchedule('t1'),
        isNull,
        reason: 'a completed treatment must not keep a future control date',
      );
      expect(repository.getTreatment('t1')!.isCompleted, isTrue);
    },
  );

  test(
    'paginated full sync keeps schedules from earlier pages (C-4)',
    () async {
      await repository.saveTreatment(activeCourse('c1'));
      await repository.saveTreatment(activeCourse('c2'));
      await repository.saveSchedule(schedule('c1', '2026-11-01'));
      await repository.saveSchedule(schedule('c2', '2026-12-01'));

      when(
        api.sync(
          sinceVersion: anyNamed('sinceVersion'),
          sinceScheduleVersion: anyNamed('sinceScheduleVersion'),
          sinceTimestamp: anyNamed('sinceTimestamp'),
          limit: anyNamed('limit'),
          offset: anyNamed('offset'),
        ),
      ).thenAnswer((invocation) async {
        final offset = invocation.namedArguments[#offset] as int? ?? 0;
        if (offset == 0) {
          return response(
            courses: [activeCourse('c1')],
            schedules: [schedule('c1', '2026-11-01')],
            hasMore: true,
            maxVersion: 1,
            maxScheduleVersion: 1,
          );
        }
        return response(
          courses: [activeCourse('c2')],
          schedules: [schedule('c2', '2026-12-01')],
          maxVersion: 2,
          maxScheduleVersion: 2,
        );
      });

      await service.fullSync();

      expect(
        repository.getSchedule('c1'),
        isNotNull,
        reason: 'page 2 must not prune page 1 schedules',
      );
      expect(repository.getSchedule('c2'), isNotNull);
    },
  );

  test('full sync prunes only genuinely stale schedules (C-1)', () async {
    await repository.saveTreatment(activeCourse('c1'));
    await repository.saveTreatment(activeCourse('cOld'));
    await repository.saveSchedule(schedule('c1', '2026-11-01'));
    await repository.saveSchedule(schedule('cOld', '2026-05-01'));

    when(
      api.sync(
        sinceVersion: anyNamed('sinceVersion'),
        sinceScheduleVersion: anyNamed('sinceScheduleVersion'),
        sinceTimestamp: anyNamed('sinceTimestamp'),
        limit: anyNamed('limit'),
        offset: anyNamed('offset'),
      ),
    ).thenAnswer(
      (_) async => response(
        courses: [activeCourse('c1')],
        schedules: [schedule('c1', '2026-11-01')],
        maxVersion: 1,
        maxScheduleVersion: 1,
      ),
    );

    await service.fullSync();

    expect(repository.getSchedule('c1'), isNotNull);
    expect(
      repository.getSchedule('cOld'),
      isNull,
      reason:
          'an authoritative full sync may remove schedules of non-active courses',
    );
  });
  test(
    'sync requeues a local confirmation the backend still reports as open',
    () async {
      await repository.saveTreatment(activeCourse('t1'));
      when(
        api.sync(
          sinceVersion: anyNamed('sinceVersion'),
          sinceScheduleVersion: anyNamed('sinceScheduleVersion'),
          sinceTimestamp: anyNamed('sinceTimestamp'),
          limit: anyNamed('limit'),
          offset: anyNamed('offset'),
        ),
      ).thenAnswer((_) async => response());
      when(notifications.todayWib()).thenReturn('2026-10-19');
      when(
        notifications.ensureTodayConfirmationQueued(),
      ).thenAnswer((_) async => true);
      when(api.getProgress()).thenAnswer(
        (_) async => PatientProgress(
          treatment: ProgressTreatment(
            id: 't1',
            startDate: '2026-10-01',
            initialTargetEndDate: '2027-04-01',
          ),
          visits: const [],
          adherence: AdherenceHistory(
            days: const [],
            totalTaken: 0,
            totalMissed: 0,
            missedStreak: 0,
          ),
          serverTime: DateTime.now().toIso8601String(),
        ),
      );

      await service.incrementalSync();

      verify(notifications.ensureTodayConfirmationQueued()).called(1);
    },
  );

  test(
    'current treatment is the newest active course and never borrows an old schedule',
    () async {
      final completed = TreatmentCourse(
        id: 'old-completed',
        patientId: 'p1',
        startDate: '2026-01-01',
        initialTargetEndDate: '2026-07-01',
        completedAt: DateTime.utc(2026, 7, 2),
        version: 9,
        reviewDue: false,
        remindersEnabled: false,
      );
      final active = TreatmentCourse(
        id: 'new-active',
        patientId: 'p1',
        startDate: '2026-10-01',
        initialTargetEndDate: '2027-04-01',
        version: 1,
        reviewDue: false,
        remindersEnabled: true,
      );
      await repository.saveTreatment(completed);
      await repository.saveTreatment(active);
      await repository.saveSchedule(schedule('old-completed', '2026-05-01'));

      expect(repository.getCurrentTreatment()?.id, 'new-active');
      expect(
        repository.getCurrentSchedule(),
        isNull,
        reason:
            'a new course without its own schedule must not show the old course schedule',
      );

      await repository.saveSchedule(schedule('new-active', '2026-11-01'));
      expect(repository.getCurrentSchedule()?.scheduledDate, '2026-11-01');
    },
  );

  test('completed history shows the most recently started course', () async {
    await repository.saveTreatment(
      TreatmentCourse(
        id: 'older',
        patientId: 'p1',
        startDate: '2025-01-01',
        initialTargetEndDate: '2025-07-01',
        completedAt: DateTime.utc(2025, 7, 2),
        version: 3,
        reviewDue: false,
        remindersEnabled: false,
      ),
    );
    await repository.saveTreatment(
      TreatmentCourse(
        id: 'newer',
        patientId: 'p1',
        startDate: '2026-01-01',
        initialTargetEndDate: '2026-07-01',
        completedAt: DateTime.utc(2026, 7, 2),
        version: 4,
        reviewDue: false,
        remindersEnabled: false,
      ),
    );

    expect(repository.getCurrentTreatment()?.id, 'newer');
  });

  test(
    'sync does not requeue a confirmation the backend already stored today',
    () async {
      await repository.saveTreatment(activeCourse('t1'));
      when(
        api.sync(
          sinceVersion: anyNamed('sinceVersion'),
          sinceScheduleVersion: anyNamed('sinceScheduleVersion'),
          sinceTimestamp: anyNamed('sinceTimestamp'),
          limit: anyNamed('limit'),
          offset: anyNamed('offset'),
        ),
      ).thenAnswer((_) async => response());
      when(notifications.todayWib()).thenReturn('2026-10-19');
      when(api.getProgress()).thenAnswer(
        (_) async => PatientProgress(
          treatment: ProgressTreatment(
            id: 't1',
            startDate: '2026-10-01',
            initialTargetEndDate: '2027-04-01',
          ),
          visits: const [],
          adherence: AdherenceHistory(
            days: [
              AdherenceDay(
                date: '2026-10-19',
                status: 'Sudah diminum',
                confirmedAt: '2026-10-19T01:00:00.000Z',
              ),
            ],
            totalTaken: 1,
            totalMissed: 0,
            missedStreak: 0,
          ),
          serverTime: DateTime.now().toIso8601String(),
        ),
      );

      await service.incrementalSync();

      verifyNever(notifications.ensureTodayConfirmationQueued());
    },
  );
}
