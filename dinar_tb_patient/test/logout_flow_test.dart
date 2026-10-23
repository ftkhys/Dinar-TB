// UI regression tests for the "Keluar Akun" flow and the activation notice.
//
// These cover the user-facing contract:
//  - cancelling keeps the session and does not call logout
//  - confirming calls logout (which clears the session)
//  - unsynced offline confirmations are surfaced before anything is dropped
//  - the activation screen explains an invalidated session

import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mockito/mockito.dart';

import 'package:dinar_tb_patient/models/models.dart';
import 'package:dinar_tb_patient/repositories/schedule_repository.dart';
import 'package:dinar_tb_patient/screens/activation_screen.dart';
import 'package:dinar_tb_patient/screens/profil_screen.dart';
import 'package:dinar_tb_patient/services/activation_service.dart';
import 'package:dinar_tb_patient/services/api_client.dart';
import 'package:dinar_tb_patient/services/secure_store.dart';
import 'package:dinar_tb_patient/services/sync_service.dart';

import 'sync_service_retry_test.mocks.dart';

class InMemorySecureStore implements SecureStore {
  final Map<String, String> values = {};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async => values.remove(key);
}

class FakeApiClient extends ApiClient {
  FakeApiClient() : super(baseUrl: 'http://test.invalid');

  @override
  Future<ActivationResult> activateDevice({
    required String activationCode,
    required String deviceIdentifier,
  }) async => const ActivationResult(
    deviceId: 'device-1',
    deviceCredential: 'credential-1',
    accessToken: 'access-1',
  );
}

void main() {
  late Directory tempDir;
  late ScheduleRepository repository;
  late SyncService syncService;
  late MockApiClient api;
  late MockNotificationService notifications;
  late MockConnectivity connectivity;
  late ActivationService activationService;

  final patient = Patient(
    id: 'patient-a',
    fullName: 'Pasien A',
    registerNumber: 'REG-A',
    address: 'Alamat A',
    version: 1,
  );

  setUpAll(() async {
    tempDir = await Directory.systemTemp.createTemp('dinar_logout_ui_test');
    Hive.init(tempDir.path);
    Hive.registerAdapter(PatientAdapter());
    Hive.registerAdapter(TreatmentCourseAdapter());
    Hive.registerAdapter(ControlScheduleAdapter());
    Hive.registerAdapter(ReminderWindowAdapter());
    Hive.registerAdapter(AdherenceHistoryAdapter());
    Hive.registerAdapter(AdherenceDayAdapter());
    Hive.registerAdapter(AdherenceOperationAdapter());
    Hive.registerAdapter(AdherenceOperationStatusAdapter());
    Hive.registerAdapter(VisitRecordAdapter());
  });

  tearDownAll(() async {
    await Hive.close();
    await tempDir.delete(recursive: true);
  });

  setUp(() async {
    api = MockApiClient();
    notifications = MockNotificationService();
    connectivity = MockConnectivity();

    when(
      connectivity.checkConnectivity(),
    ).thenAnswer((_) async => [ConnectivityResult.none]);
    when(
      connectivity.onConnectivityChanged,
    ).thenAnswer((_) => Stream.value([ConnectivityResult.none]));
    when(notifications.isTodayConfirmed()).thenReturn(false);
    when(notifications.cancelAll()).thenAnswer((_) async {});
    when(notifications.clearLocalConfirmationState()).thenAnswer((_) async {});

    repository = ScheduleRepository();
    await repository.init();
    await repository.clearAll();
    await repository.savePatient(patient);

    syncService = SyncService(
      apiClient: api,
      repository: repository,
      notificationService: notifications,
      connectivity: connectivity,
    );
    await syncService.init();

    activationService = ActivationService(
      InMemorySecureStore(),
      FakeApiClient(),
    );
  });

  tearDown(() async {
    await syncService.clearQueuedOperations();
    await repository.clearAll();
    syncService.dispose();
  });

  Future<void> pumpProfil(
    WidgetTester tester, {
    required Future<void> Function() onLogout,
  }) async {
    tester.view.physicalSize = const Size(1080, 2600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ProfilScreen(
            repository: repository,
            notificationService: notifications,
            syncService: syncService,
            onLogout: onLogout,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('logout can be cancelled without ending the session', (
    tester,
  ) async {
    var logoutCalls = 0;
    await pumpProfil(tester, onLogout: () async => logoutCalls++);

    expect(find.text('Keluar Akun'), findsOneWidget);

    await tester.tap(find.text('Keluar Akun'));
    await tester.pumpAndSettle();

    expect(find.text('Keluar dari akun?'), findsOneWidget);
    expect(
      find.textContaining('harus memasukkan kode aktivasi baru'),
      findsOneWidget,
    );

    await tester.tap(find.text('Batal'));
    await tester.pumpAndSettle();

    expect(find.text('Keluar dari akun?'), findsNothing);
    expect(logoutCalls, 0);
    expect(repository.getPatient(), isNotNull);
  });

  testWidgets('confirming logout calls the session-ending callback', (
    tester,
  ) async {
    var logoutCalls = 0;
    await pumpProfil(tester, onLogout: () async => logoutCalls++);

    await tester.tap(find.text('Keluar Akun'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Keluar'));
    await tester.pumpAndSettle();

    expect(logoutCalls, 1);
  });

  testWidgets('unsynced offline confirmations require an explicit warning '
      'before the queue can be dropped', (tester) async {
    var logoutCalls = 0;
    await pumpProfil(tester, onLogout: () async => logoutCalls++);

    await tester.runAsync(
      () => syncService.enqueueAdherenceOperation(
        AdherenceOperation(
          operationId: 'op-1',
          treatmentCourseId: 'treatment-a',
          adherenceDate: '2026-10-18',
          confirmedAt: DateTime.now().toUtc().toIso8601String(),
          expectedTreatmentVersion: 1,
          createdAt: DateTime.now(),
        ),
      ),
    );
    await tester.pump();
    expect(syncService.pendingAdherenceCount, 1);

    // The pending banner shows an indeterminate spinner, so bounded pumps are
    // used instead of `pumpAndSettle` (which would never settle).
    Future<void> pumpDialog() async {
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
    }

    await tester.tap(find.text('Keluar Akun'));
    await pumpDialog();
    await tester.tap(find.text('Keluar'));
    await pumpDialog();

    expect(find.text('Data belum tersinkronisasi'), findsOneWidget);
    expect(find.textContaining('1 konfirmasi obat'), findsOneWidget);

    await tester.tap(find.text('Batal'));
    await pumpDialog();
    expect(logoutCalls, 0);
    expect(
      syncService.pendingAdherenceCount,
      1,
      reason: 'cancelling must keep the unsynced confirmation',
    );

    await tester.tap(find.text('Keluar Akun'));
    await pumpDialog();
    await tester.tap(find.text('Keluar'));
    await pumpDialog();
    await tester.tap(find.text('Tetap keluar'));
    await pumpDialog();

    expect(logoutCalls, 1);
  });

  testWidgets('activation screen shows the invalid-session explanation', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ActivationScreen(
          activationService: activationService,
          onActivated: () {},
          notice:
              'Data pasien untuk sesi ini sudah tidak ditemukan di server. '
              'Masukkan kode aktivasi baru dari petugas untuk melanjutkan.',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.textContaining('sudah tidak ditemukan di server'),
      findsOneWidget,
    );
    expect(find.text('Kode Aktivasi'), findsOneWidget);
  });
}
