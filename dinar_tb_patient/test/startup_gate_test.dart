// Startup/session routing tests with the real StartupGate:
//  - a connectivity failure keeps the patient in the app (offline behavior)
//  - an explicit 401 ends the session and shows the activation screen
//  - "Keluar Akun" returns to activation and clears the local session
//  - a background 404 invalidates the session and shows the reason
//
// `TestSessionService` only skips the Hive writes (already covered by
// `session_service_test.dart`); it still clears the in-memory credentials so
// the routing and notice behavior is exercised end to end.

import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mockito/mockito.dart';

import 'package:dinar_tb_patient/main.dart';
import 'package:dinar_tb_patient/models/models.dart';
import 'package:dinar_tb_patient/repositories/schedule_repository.dart';
import 'package:dinar_tb_patient/screens/activation_screen.dart';
import 'package:dinar_tb_patient/services/activation_service.dart';
import 'package:dinar_tb_patient/services/api_client.dart';
import 'package:dinar_tb_patient/services/fcm_service.dart';
import 'package:dinar_tb_patient/services/notification_service.dart';
import 'package:dinar_tb_patient/services/secure_store.dart';
import 'package:dinar_tb_patient/services/session_service.dart';
import 'package:dinar_tb_patient/services/sync_service.dart';
import 'package:dinar_tb_patient/theme/app_theme.dart';

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

  Object? refreshError;

  @override
  Future<ActivationResult> activateDevice({
    required String activationCode,
    required String deviceIdentifier,
  }) async => const ActivationResult(
    deviceId: 'device-1',
    deviceCredential: 'credential-1',
    accessToken: 'access-1',
  );

  @override
  Future<String> refreshDeviceToken({
    required String deviceId,
    required String deviceCredential,
  }) async {
    if (refreshError != null) throw refreshError!;
    return 'refreshed-token';
  }
}

/// Skips the Hive-backed cleanup so the widget test does not depend on file IO
/// inside the fake-async test zone. Credential clearing stays real.
class TestSessionService extends SessionService {
  TestSessionService({
    required super.activationService,
    required super.repository,
    required super.syncService,
    required super.notificationService,
  });

  int endSessionCalls = 0;
  int clearPatientDataCalls = 0;

  @override
  Future<void> clearPatientData() async {
    clearPatientDataCalls++;
  }

  @override
  Future<void> endSession() async {
    endSessionCalls++;
    await activationService.clearCredentials(rotateDeviceIdentifier: true);
  }
}

/// Hand-written fake so the shell's field access (`initialNotificationPayload`)
/// and the async helpers behave without a platform plugin.
class FakeNotificationService extends Mock implements NotificationService {
  @override
  String? initialNotificationPayload;

  @override
  String todayWib() => '2026-10-18';

  @override
  bool isTodayConfirmed([String? treatmentId]) => false;

  @override
  DateTime? getTodayConfirmedAt([String? treatmentId]) => null;

  @override
  Future<void> cancelAll() async {}

  @override
  Future<void> clearLocalConfirmationState() async {}

  @override
  Future<void> rescheduleAll({
    required List<TreatmentCourse> treatments,
    required List<ControlSchedule> schedules,
    required List<ReminderWindow> reminderWindows,
    bool force = false,
  }) async {}

  @override
  Future<bool> shouldShowNotificationSetup() async => false;

  @override
  Future<void> markNotificationSetupSeen() async {}

  @override
  void setSyncService(SyncService? syncService) {}

  @override
  void setRepository(ScheduleRepository? repository) {}

  @override
  Future<bool> areNotificationsEnabled() async => true;
}

void main() {
  late Directory tempDir;
  late ScheduleRepository repository;
  late InMemorySecureStore store;
  late FakeApiClient activationApi;
  late ActivationService activationService;
  late MockApiClient api;
  late MockConnectivity connectivity;
  late FakeNotificationService notifications;
  late SyncService syncService;
  late TestSessionService sessionService;

  final patient = Patient(
    id: 'patient-a',
    fullName: 'Pasien A',
    registerNumber: 'REG-A',
    address: 'Alamat A',
    version: 1,
  );

  setUpAll(() async {
    tempDir = await Directory.systemTemp.createTemp('dinar_gate_test');
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
    store = InMemorySecureStore();
    store.values[ActivationService.deviceIdentifierKey] = 'identifier-a';
    store.values[ActivationService.deviceIdKey] = 'device-a';
    store.values[ActivationService.deviceCredentialKey] = 'credential-a';

    activationApi = FakeApiClient();
    activationService = ActivationService(store, activationApi);

    api = MockApiClient();
    connectivity = MockConnectivity();
    notifications = FakeNotificationService();

    when(
      connectivity.checkConnectivity(),
    ).thenAnswer((_) async => [ConnectivityResult.none]);
    when(
      connectivity.onConnectivityChanged,
    ).thenAnswer((_) => Stream.value([ConnectivityResult.none]));

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

    sessionService = TestSessionService(
      activationService: activationService,
      repository: repository,
      syncService: syncService,
      notificationService: notifications,
    );
  });

  tearDown(() async {
    await syncService.clearQueuedOperations();
    await repository.clearAll();
    syncService.dispose();
  });

  /// Bounded pumps: the loading state uses an indeterminate spinner, so
  /// `pumpAndSettle` would never settle.
  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 8; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  Future<void> pumpGate(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.lightTheme,
        home: StartupGate(
          repository: repository,
          apiClient: activationApi,
          activationService: activationService,
          notificationService: notifications,
          syncService: syncService,
          fcmService: FcmService(),
          sessionService: sessionService,
        ),
      ),
    );
    await settle(tester);
  }

  testWidgets('a refresh connectivity failure keeps the patient logged in', (
    tester,
  ) async {
    activationApi.refreshError = ApiException(
      null,
      'Terjadi gangguan koneksi. Periksa internet.',
    );

    await pumpGate(tester);

    expect(find.byType(ActivationScreen), findsNothing);
    expect(find.byType(PatientShell), findsOneWidget);
    expect(await activationService.isActivated(), isTrue);
    expect(sessionService.endSessionCalls, 0);
  });

  testWidgets('an explicit 401 ends the session and routes to activation', (
    tester,
  ) async {
    activationApi.refreshError = ApiException(
      401,
      'Kredensial device tidak berlaku.',
    );

    await pumpGate(tester);

    expect(find.byType(ActivationScreen), findsOneWidget);
    expect(find.textContaining('sudah tidak berlaku'), findsOneWidget);
    expect(await activationService.isActivated(), isFalse);
    expect(
      store.values.containsKey(ActivationService.deviceCredentialKey),
      isFalse,
    );
    expect(sessionService.endSessionCalls, 1);
  });

  testWidgets('confirming logout from Profil returns to activation', (
    tester,
  ) async {
    await pumpGate(tester);
    expect(find.byType(PatientShell), findsOneWidget);

    await tester.tap(find.text('Profil'));
    await settle(tester);

    await tester.tap(find.text('Keluar Akun'));
    await settle(tester);
    await tester.tap(find.text('Keluar'));
    await settle(tester);

    expect(find.byType(ActivationScreen), findsOneWidget);
    expect(await activationService.isActivated(), isFalse);
    expect(sessionService.endSessionCalls, 1);
  });

  testWidgets('a 404 during a background sync invalidates the session', (
    tester,
  ) async {
    await pumpGate(tester);
    expect(find.byType(ActivationScreen), findsNothing);

    await syncService.onSessionInvalid!(SessionInvalidReason.patientNotFound);
    await settle(tester);

    expect(find.byType(ActivationScreen), findsOneWidget);
    expect(
      find.textContaining('sudah tidak ditemukan di server'),
      findsOneWidget,
    );
    expect(await activationService.isActivated(), isFalse);
    expect(sessionService.endSessionCalls, 1);
  });
}
