// Tests for SyncService adherence queue retry policy

import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:dinar_tb_patient/models/models.dart';
import 'package:dinar_tb_patient/repositories/schedule_repository.dart';
import 'package:dinar_tb_patient/services/api_client.dart';
import 'package:dinar_tb_patient/services/sync_service.dart';
import 'package:dinar_tb_patient/services/notification_service.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';

import 'sync_service_retry_test.mocks.dart';

@GenerateMocks([
  ApiClient,
  ScheduleRepository,
  NotificationService,
  Connectivity,
])
// Mock PathProviderPlatform for testing
class MockPathProviderPlatform extends PathProviderPlatform
    with MockPlatformInterfaceMixin {
  @override
  Future<String?> getApplicationDocumentsPath() async {
    return Directory.systemTemp.path;
  }
}

void main() {
  group('SyncService - Adherence Queue Retry Policy', () {
    late MockApiClient mockApiClient;
    late MockScheduleRepository mockRepository;
    late MockNotificationService mockNotificationService;
    late MockConnectivity mockConnectivity;
    late SyncService syncService;

    const treatmentId = '123e4567-e89b-12d3-a456-426614174000';
    const operationId = 'op-123';

    final mockPatient = Patient(
      id: 'p1',
      fullName: 'Test Patient',
      registerNumber: 'REG001',
      address: 'Test Address',
      version: 1,
    );

    final mockSyncResponse = SyncResponse(
      patient: mockPatient,
      treatmentCourses: [],
      controlSchedules: [],
      reminderWindows: [],
      serverTime: DateTime.now().toIso8601String(),
      hasMore: false,
      maxVersion: 0,
    );

    setUpAll(() async {
      // Register Hive adapters
      Hive.registerAdapter(AdherenceOperationAdapter());
      Hive.registerAdapter(AdherenceOperationStatusAdapter());

      // Register mock path provider
      PathProviderPlatform.instance = MockPathProviderPlatform();

      // Initialize Hive with temporary directory
      await Hive.initFlutter();
    });

    setUp(() async {
      mockApiClient = MockApiClient();
      mockRepository = MockScheduleRepository();
      mockNotificationService = MockNotificationService();
      mockConnectivity = MockConnectivity();

      // Default connectivity: online
      when(
        mockConnectivity.checkConnectivity(),
      ).thenAnswer((_) async => [ConnectivityResult.wifi]);
      when(
        mockConnectivity.onConnectivityChanged,
      ).thenAnswer((_) => Stream.value([ConnectivityResult.wifi]));

      when(mockRepository.getMaxVersion()).thenReturn(0);
      when(mockRepository.getMaxScheduleVersion()).thenReturn(0);
      when(mockRepository.getMaxSyncTimestamp()).thenReturn(null);
      when(mockRepository.setMaxSyncTimestamp(any)).thenAnswer((_) async {});
      when(mockRepository.getAllTreatments()).thenReturn([]);
      when(mockRepository.getAllSchedules()).thenReturn([]);
      when(mockRepository.getReminderWindows()).thenReturn(<ReminderWindow>[]);
      when(mockRepository.getLastSyncTime()).thenReturn(null);

      // Default sync mock for incrementalSync
      when(
        mockApiClient.sync(
          sinceVersion: 0,
          sinceScheduleVersion: 0,
          limit: 100,
          offset: 0,
        ),
      ).thenAnswer((_) async => mockSyncResponse);

      syncService = SyncService(
        apiClient: mockApiClient,
        repository: mockRepository,
        notificationService: mockNotificationService,
        connectivity: mockConnectivity,
      );
      await syncService.init();
    });

    tearDown(() async {
      syncService.dispose();
      await Hive.deleteBoxFromDisk('adherence_queue');
    });

    test('an archived patient cancels every local reminder on sync', () async {
      when(mockRepository.isPatientArchived).thenReturn(true);

      await syncService.fullSync();

      verify(mockNotificationService.cancelAll()).called(1);
      verifyNever(
        mockNotificationService.rescheduleAll(
          treatments: anyNamed('treatments'),
          schedules: anyNamed('schedules'),
          reminderWindows: anyNamed('reminderWindows'),
        ),
      );
    });

    group('Queue Persistence and Status Management', () {
      test(
        'operation reaching max auto retries is marked as needsAttention, not deleted',
        () async {
          // Arrange: Override default mock to throw network error
          when(
            mockApiClient.confirmAdherenceOnline(
              treatmentId: treatmentId,
              operationId: operationId,
              adherenceDate: '2026-10-05',
              confirmedAt: '2026-10-05T07:00:00.000Z',
              expectedTreatmentVersion: 1,
            ),
          ).thenThrow(Exception('Network error'));

          // Act: Enqueue operation and process queue multiple times
          final operation = AdherenceOperation(
            operationId: operationId,
            treatmentCourseId: treatmentId,
            adherenceDate: '2026-10-05',
            confirmedAt: '2026-10-05T07:00:00.000Z',
            expectedTreatmentVersion: 1,
            retryCount: 0,
            createdAt: DateTime.now(),
            status: AdherenceOperationStatus.pending,
          );
          await syncService.enqueueAdherenceOperation(operation);

          // Process queue 6 times (maxAutoRetries = 5, so 6th time should mark as needsAttention)
          for (int i = 0; i < 6; i++) {
            await syncService.processQueueForTesting();
          }

          // Assert: Operation should be marked as needsAttention, not deleted
          final ops = syncService.getAllOperations();
          expect(ops.length, 1);
          expect(ops.first.status, AdherenceOperationStatus.needsAttention);
          expect(ops.first.retryCount, 5);
        },
      );

      test(
        'operation marked as needsAttention persists after service re-init',
        () async {
          // Arrange: Create operation with needsAttention status
          final operation = AdherenceOperation(
            operationId: operationId,
            treatmentCourseId: treatmentId,
            adherenceDate: '2026-10-05',
            confirmedAt: '2026-10-05T07:00:00.000Z',
            expectedTreatmentVersion: 1,
            retryCount: 5,
            createdAt: DateTime.now(),
            status: AdherenceOperationStatus.needsAttention,
          );
          await syncService.enqueueAdherenceOperation(operation);

          // Verify it's there
          expect(syncService.needsAttentionCount, 1);

          // Act: Dispose and re-init (simulating app restart)
          syncService.dispose();

          final newSyncService = SyncService(
            apiClient: mockApiClient,
            repository: mockRepository,
            notificationService: mockNotificationService,
            connectivity: mockConnectivity,
          );
          await newSyncService.init();

          // Assert: Operation still exists with needsAttention status
          expect(newSyncService.needsAttentionCount, 1);
          final ops = newSyncService.getOperationsNeedingAttention();
          expect(ops.length, 1);
          expect(ops.first.operationId, operationId);
          expect(ops.first.status, AdherenceOperationStatus.needsAttention);
          expect(ops.first.retryCount, 5);

          newSyncService.dispose();
        },
      );

      test(
        'getPendingOperations and getOperationsNeedingAttention return correct lists',
        () async {
          final pendingOp = AdherenceOperation(
            operationId: 'op-pending',
            treatmentCourseId: treatmentId,
            adherenceDate: '2026-10-05',
            confirmedAt: '2026-10-05T07:00:00.000Z',
            expectedTreatmentVersion: 1,
            retryCount: 0,
            createdAt: DateTime.now(),
            status: AdherenceOperationStatus.pending,
          );
          final needsAttentionOp = AdherenceOperation(
            operationId: 'op-needs-attention',
            treatmentCourseId: treatmentId,
            adherenceDate: '2026-10-05',
            confirmedAt: '2026-10-05T07:00:00.000Z',
            expectedTreatmentVersion: 1,
            retryCount: 5,
            createdAt: DateTime.now(),
            status: AdherenceOperationStatus.needsAttention,
          );
          final completedOp = AdherenceOperation(
            operationId: 'op-completed',
            treatmentCourseId: treatmentId,
            adherenceDate: '2026-10-05',
            confirmedAt: '2026-10-05T07:00:00.000Z',
            expectedTreatmentVersion: 1,
            retryCount: 0,
            createdAt: DateTime.now(),
            status: AdherenceOperationStatus.completed,
          );

          await syncService.enqueueAdherenceOperation(pendingOp);
          await syncService.enqueueAdherenceOperation(needsAttentionOp);
          await syncService.enqueueAdherenceOperation(completedOp);

          final pending = syncService.getPendingOperations();
          final needsAttention = syncService.getOperationsNeedingAttention();
          final all = syncService.getAllOperations();

          expect(pending.length, 1);
          expect(pending.first.operationId, 'op-pending');

          expect(needsAttention.length, 1);
          expect(needsAttention.first.operationId, 'op-needs-attention');

          expect(all.length, 3);
        },
      );

      test(
        'adherenceSyncStateFor reflects the queued operation state',
        () async {
          // No operation for the date yet -> treated as already on the server.
          expect(
            syncService.adherenceSyncStateFor(treatmentId, '2026-10-05'),
            AdherenceSyncState.synced,
          );

          // Go offline so enqueuing does not immediately process/clear the op.
          syncService.setConnectivityForTesting(false);

          await syncService.enqueueAdherenceOperation(
            AdherenceOperation(
              operationId: 'op-state-pending',
              treatmentCourseId: treatmentId,
              adherenceDate: '2026-10-05',
              confirmedAt: '2026-10-05T07:00:00.000Z',
              expectedTreatmentVersion: 1,
              createdAt: DateTime.now(),
              status: AdherenceOperationStatus.pending,
            ),
          );
          expect(
            syncService.adherenceSyncStateFor(treatmentId, '2026-10-05'),
            AdherenceSyncState.pending,
          );

          await syncService.enqueueAdherenceOperation(
            AdherenceOperation(
              operationId: 'op-state-na',
              treatmentCourseId: treatmentId,
              adherenceDate: '2026-10-05',
              confirmedAt: '2026-10-05T07:00:00.000Z',
              expectedTreatmentVersion: 1,
              retryCount: 5,
              createdAt: DateTime.now(),
              status: AdherenceOperationStatus.needsAttention,
            ),
          );
          expect(
            syncService.adherenceSyncStateFor(treatmentId, '2026-10-05'),
            AdherenceSyncState.needsAttention,
          );

          // A different date is unaffected.
          expect(
            syncService.adherenceSyncStateFor(treatmentId, '2026-10-06'),
            AdherenceSyncState.synced,
          );

          syncService.setConnectivityForTesting(true);
        },
      );

      test('enqueue reports false when the session is suspended instead of '
          'pretending the confirmation is queued', () async {
        final operation = AdherenceOperation(
          operationId: operationId,
          treatmentCourseId: treatmentId,
          adherenceDate: '2026-10-05',
          confirmedAt: '2026-10-05T07:00:00.000Z',
          expectedTreatmentVersion: 1,
          createdAt: DateTime.now(),
        );

        await syncService.suspend();

        final queued = await syncService.enqueueAdherenceOperation(operation);

        expect(queued, isFalse);
        expect(syncService.getAllOperations(), isEmpty);
      });

      test('a queued confirmation survives offline and syncs after reconnect '
          'without blocking the confirm path', () async {
        final operation = AdherenceOperation(
          operationId: operationId,
          treatmentCourseId: treatmentId,
          adherenceDate: '2026-10-05',
          confirmedAt: '2026-10-05T07:00:00.000Z',
          expectedTreatmentVersion: 1,
          createdAt: DateTime.now(),
        );

        syncService.setConnectivityForTesting(false);
        final queued = await syncService.queueAdherenceOperation(operation);

        expect(queued, isTrue);
        expect(syncService.getPendingOperations(), hasLength(1));
        verifyNever(
          mockApiClient.confirmAdherenceOnline(
            treatmentId: anyNamed('treatmentId'),
            operationId: anyNamed('operationId'),
            adherenceDate: anyNamed('adherenceDate'),
            confirmedAt: anyNamed('confirmedAt'),
            expectedTreatmentVersion: anyNamed('expectedTreatmentVersion'),
          ),
        );

        when(
          mockApiClient.confirmAdherenceOnline(
            treatmentId: treatmentId,
            operationId: operationId,
            adherenceDate: '2026-10-05',
            confirmedAt: '2026-10-05T07:00:00.000Z',
            expectedTreatmentVersion: 1,
          ),
        ).thenAnswer((_) async => {'code': 'APPLIED'});

        syncService.setConnectivityForTesting(true);
        await syncService.processQueueForTesting();

        expect(syncService.getAllOperations(), isEmpty);
        verify(
          mockApiClient.confirmAdherenceOnline(
            treatmentId: treatmentId,
            operationId: operationId,
            adherenceDate: '2026-10-05',
            confirmedAt: '2026-10-05T07:00:00.000Z',
            expectedTreatmentVersion: 1,
          ),
        ).called(1);
      });

      test('retryOperation resets needsAttention to pending', () async {
        // Create operation with needsAttention status
        final operation = AdherenceOperation(
          operationId: operationId,
          treatmentCourseId: treatmentId,
          adherenceDate: '2026-10-05',
          confirmedAt: '2026-10-05T07:00:00.000Z',
          expectedTreatmentVersion: 1,
          retryCount: 5,
          createdAt: DateTime.now(),
          status: AdherenceOperationStatus.needsAttention,
        );
        await syncService.enqueueAdherenceOperation(operation);

        // Go offline to prevent queue processing from calling API
        syncService.setConnectivityForTesting(false);

        // Act: Retry the operation (offline, so no API call)
        final result = await syncService.retryOperation(operationId);

        // Restore online connectivity
        syncService.setConnectivityForTesting(true);

        // Assert: Operation status reset to pending
        expect(result, true);
        final ops = syncService.getAllOperations();
        expect(ops.length, 1);
        expect(ops.first.status, AdherenceOperationStatus.pending);
        expect(
          ops.first.retryCount,
          0,
        ); // retryCount reset by retryOperation for fresh attempt
      });

      test(
        'retryAllNeedsAttention resets all needsAttention to pending',
        () async {
          // Create multiple operations needing attention
          for (int i = 0; i < 3; i++) {
            final op = AdherenceOperation(
              operationId: 'op-$i',
              treatmentCourseId: treatmentId,
              adherenceDate: '2026-10-05',
              confirmedAt: '2026-10-05T07:00:00.000Z',
              expectedTreatmentVersion: 1,
              retryCount: 5,
              createdAt: DateTime.now(),
              status: AdherenceOperationStatus.needsAttention,
            );
            await syncService.enqueueAdherenceOperation(op);
          }

          expect(syncService.needsAttentionCount, 3);

          // Act: Retry all (without API call)
          final retried = await syncService.retryAllNeedsAttention();

          // Assert: All 3 were reset to pending
          expect(retried, 3);
          expect(syncService.needsAttentionCount, 0);
          expect(syncService.pendingAdherenceCount, 3);
        },
      );
    });

    group('Queue Processing with API (integration)', () {
      test(
        'CONFLICT creates new operation with new operationId, old operation removed',
        () async {
          // Arrange: Mock API to return CONFLICT
          when(
            mockApiClient.confirmAdherenceOnline(
              treatmentId: treatmentId,
              operationId: operationId,
              adherenceDate: '2026-10-05',
              confirmedAt: '2026-10-05T07:00:00.000Z',
              expectedTreatmentVersion: 1,
            ),
          ).thenAnswer(
            (_) async => {
              'code': 'CONFLICT',
              'server': {'version': 2},
            },
          );

          when(
            mockApiClient.sync(
              sinceVersion: 0,
              sinceScheduleVersion: 0,
              limit: 100,
              offset: 0,
            ),
          ).thenAnswer((_) async => mockSyncResponse);

          // Go offline to prevent immediate processing on enqueue
          syncService.setConnectivityForTesting(false);

          // Act: Enqueue operation (offline, so operation should be queued)
          final operation = AdherenceOperation(
            operationId: operationId,
            treatmentCourseId: treatmentId,
            adherenceDate: '2026-10-05',
            confirmedAt: '2026-10-05T07:00:00.000Z',
            expectedTreatmentVersion: 1,
            retryCount: 0,
            createdAt: DateTime.now(),
            status: AdherenceOperationStatus.pending,
          );
          await syncService.enqueueAdherenceOperation(operation);

          // Check queue before processing (offline, so operation should be queued)
          final beforeOps = syncService.getAllOperations();
          expect(beforeOps.length, 1);
          expect(beforeOps.first.operationId, operationId);

          // Go online and process
          syncService.setConnectivityForTesting(true);
          await syncService.processQueueForTesting();

          // Assert: Old operation removed, new operation with new operationId created and queued
          final ops = syncService.getAllOperations();
          expect(ops.length, 1);
          expect(ops.first.operationId, isNot(operationId)); // New operationId
          expect(ops.first.expectedTreatmentVersion, 2); // Updated version
          expect(ops.first.retryCount, 1); // Incremented
        },
      );

      test(
        'operations with same adherenceDate but different operationId do not duplicate confirmation',
        () async {
          // This test verifies that the conflict resolution strategy (new operationId)
          // doesn't create duplicate confirmations for the same date.
          // The backend handles this via idempotency key (operationId) and
          // duplicate detection (same adherenceDate + same confirmedAt).

          when(
            mockApiClient.confirmAdherenceOnline(
              treatmentId: treatmentId,
              operationId: anyNamed('operationId'),
              adherenceDate: '2026-10-05',
              confirmedAt: '2026-10-05T07:00:00.000Z',
              expectedTreatmentVersion: anyNamed('expectedTreatmentVersion'),
            ),
          ).thenAnswer((_) async => {'code': 'APPLIED'});

          when(
            mockApiClient.sync(
              sinceVersion: 0,
              sinceScheduleVersion: 0,
              limit: 100,
              offset: 0,
            ),
          ).thenAnswer((_) async => mockSyncResponse);

          // Create two operations for the same date but different operationIds
          // This simulates the CONFLICT resolution creating a new operation
          final op1 = AdherenceOperation(
            operationId: 'op-1',
            treatmentCourseId: treatmentId,
            adherenceDate: '2026-10-05',
            confirmedAt: '2026-10-05T07:00:00.000Z',
            expectedTreatmentVersion: 1,
            retryCount: 0,
            createdAt: DateTime.now(),
            status: AdherenceOperationStatus.pending,
          );
          final op2 = AdherenceOperation(
            operationId: 'op-2',
            treatmentCourseId: treatmentId,
            adherenceDate: '2026-10-05',
            confirmedAt: '2026-10-05T07:00:00.000Z',
            expectedTreatmentVersion: 2,
            retryCount: 1,
            createdAt: DateTime.now(),
            status: AdherenceOperationStatus.pending,
          );

          await syncService.enqueueAdherenceOperation(op1);
          await syncService.enqueueAdherenceOperation(op2);

          await syncService.processQueueForTesting();

          // Both should be processed and removed (no duplication in queue)
          expect(syncService.getAllOperations().length, 0);
        },
      );
    });
  });
}
