// Session lifecycle regression tests.
//
// Covered here:
//  - ending a session clears cached patient data, queued confirmations and the
//    stored credential, and rotates the installation identifier
//  - a re-activation registers a new device, so another patient can use the
//    same installation and never receives the previous patient's data
//  - only an explicit server answer (401/404) invalidates the session; a
//    connectivity failure keeps the local (offline) data intact
//
// The UI-level dialog/route flows live in `logout_flow_test.dart`.

import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mockito/mockito.dart';

import 'package:dinar_tb_patient/models/models.dart';
import 'package:dinar_tb_patient/repositories/schedule_repository.dart';
import 'package:dinar_tb_patient/services/activation_service.dart';
import 'package:dinar_tb_patient/services/api_client.dart';
import 'package:dinar_tb_patient/services/secure_store.dart';
import 'package:dinar_tb_patient/services/session_service.dart';
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

  int activationCalls = 0;
  String? lastActivationCode;
  String? lastDeviceIdentifier;
  String? lastAccessToken;

  @override
  Future<ActivationResult> activateDevice({
    required String activationCode,
    required String deviceIdentifier,
  }) async {
    activationCalls++;
    lastActivationCode = activationCode;
    lastDeviceIdentifier = deviceIdentifier;
    return ActivationResult(
      deviceId: 'device-$activationCalls',
      deviceCredential: 'credential-$activationCalls',
      accessToken: 'access-$activationCalls',
    );
  }

  @override
  Future<String> refreshDeviceToken({
    required String deviceId,
    required String deviceCredential,
  }) async => 'refreshed-token';

  @override
  void setAccessToken(String? token) {
    lastAccessToken = token;
  }
}

void main() {
  late Directory tempDir;
  late ScheduleRepository repository;
  late InMemorySecureStore store;
  late FakeApiClient activationApi;
  late ActivationService activationService;
  late MockApiClient api;
  late MockNotificationService notifications;
  late MockConnectivity connectivity;
  late SyncService syncService;
  late SessionService sessionService;

  final patientA = Patient(
    id: 'patient-a',
    fullName: 'Pasien A',
    registerNumber: 'REG-A',
    address: 'Alamat A',
    version: 1,
  );

  final patientB = Patient(
    id: 'patient-b',
    fullName: 'Pasien B',
    registerNumber: 'REG-B',
    address: 'Alamat B',
    version: 1,
  );

  TreatmentCourse courseFor(String patientId, String id) => TreatmentCourse(
    id: id,
    patientId: patientId,
    startDate: '2026-01-01',
    initialTargetEndDate: '2026-07-01',
    version: 1,
    reviewDue: false,
    remindersEnabled: true,
  );

  AdherenceOperation operation(String id) => AdherenceOperation(
    operationId: id,
    treatmentCourseId: 'treatment-a',
    adherenceDate: '2026-10-18',
    confirmedAt: DateTime.now().toUtc().toIso8601String(),
    expectedTreatmentVersion: 1,
    createdAt: DateTime.now(),
  );

  setUpAll(() async {
    tempDir = await Directory.systemTemp.createTemp('dinar_session_test');
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
    activationApi = FakeApiClient();
    activationService = ActivationService(store, activationApi);

    api = MockApiClient();
    notifications = MockNotificationService();
    connectivity = MockConnectivity();

    when(
      connectivity.checkConnectivity(),
    ).thenAnswer((_) async => [ConnectivityResult.none]);
    when(
      connectivity.onConnectivityChanged,
    ).thenAnswer((_) => Stream.value([ConnectivityResult.none]));
    when(notifications.cancelAll()).thenAnswer((_) async {});
    when(notifications.clearLocalConfirmationState()).thenAnswer((_) async {});

    repository = ScheduleRepository();
    await repository.init();
    await repository.clearAll();

    syncService = SyncService(
      apiClient: api,
      repository: repository,
      notificationService: notifications,
      connectivity: connectivity,
    );
    await syncService.init();

    sessionService = SessionService(
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

  Future<void> seedPatientA() async {
    await repository.savePatient(patientA);
    await repository.saveTreatment(courseFor('patient-a', 'treatment-a'));
    await repository.saveSchedule(
      ControlSchedule(
        treatmentCourseId: 'treatment-a',
        scheduledDate: '2026-11-01',
        version: 1,
      ),
    );
    await repository.setClinic('Puskesmas A', '08123');
    await repository.setMaxVersion(7);
    await repository.setMaxScheduleVersion(7);
    await repository.setLastSyncTime(DateTime.now());
    await repository.saveVisits([
      VisitRecord(id: 'visit-a', visitDate: '2026-09-01', medicineGiven: true),
    ]);
    await repository.saveAdherenceHistory(
      'treatment-a',
      AdherenceHistory(
        days: const [],
        totalTaken: 3,
        totalMissed: 0,
        missedStreak: 0,
      ),
    );
  }

  test('endSession clears cached data, queue and credentials, and rotates the '
      'installation identifier', () async {
    await activationService.activate('CODE-A');
    final firstIdentifier = activationApi.lastDeviceIdentifier!;
    await seedPatientA();
    await syncService.enqueueAdherenceOperation(operation('op-1'));

    expect(sessionService.pendingSyncCount, 1);
    expect(repository.getPatient(), isNotNull);

    await sessionService.endSession();

    expect(repository.getPatient(), isNull);
    expect(repository.getAllTreatments(), isEmpty);
    expect(repository.getAllSchedules(), isEmpty);
    expect(repository.getClinicName(), isNull);
    expect(repository.getMaxVersion(), 0);
    expect(repository.getMaxScheduleVersion(), 0);
    expect(repository.getLastSyncTime(), isNull);
    expect(repository.getAllVisits(), isEmpty);
    expect(repository.getAdherenceHistory('treatment-a'), isNull);

    expect(syncService.pendingAdherenceCount, 0);
    expect(syncService.needsAttentionCount, 0);
    expect(syncService.getPendingOperations(), isEmpty);

    verify(notifications.cancelAll()).called(1);
    verify(notifications.clearLocalConfirmationState()).called(1);

    expect(await activationService.isActivated(), isFalse);
    expect(
      store.values.containsKey(ActivationService.deviceIdKey),
      isFalse,
      reason: 'logout must remove the device session',
    );
    expect(
      store.values.containsKey(ActivationService.deviceCredentialKey),
      isFalse,
    );
    expect(
      store.values.containsKey(ActivationService.deviceIdentifierKey),
      isFalse,
      reason: 'a new activation must register a new device',
    );
    expect(activationApi.lastAccessToken, isNull);
    expect(activationApi.lastDeviceIdentifier, firstIdentifier);
  });

  test('clearPatientData keeps the current activation but removes the previous '
      "patient's data", () async {
    await activationService.activate('CODE-A');
    await seedPatientA();

    await sessionService.clearPatientData();

    expect(await activationService.isActivated(), isTrue);
    expect(repository.getPatient(), isNull);
    expect(repository.getAllTreatments(), isEmpty);
    expect(repository.getAllSchedules(), isEmpty);
  });

  test('switching patients rotates the device identifier and never mixes '
      'cached data', () async {
    await activationService.activate('CODE-A');
    final firstIdentifier = activationApi.lastDeviceIdentifier!;
    await seedPatientA();

    await sessionService.endSession();
    await activationService.activate('CODE-B');

    expect(activationApi.lastActivationCode, 'CODE-B');
    expect(
      activationApi.lastDeviceIdentifier,
      isNot(firstIdentifier),
      reason: 'reusing the identifier would conflict with the previous patient',
    );
    expect((await activationService.loadCredentials())!.deviceId, 'device-2');

    // The activation flow clears leftovers before the new patient's sync.
    await sessionService.clearPatientData();
    await repository.savePatient(patientB);
    await repository.saveTreatment(courseFor('patient-b', 'treatment-b'));

    expect(repository.getPatient()!.id, 'patient-b');
    expect(
      repository.getAllTreatments().map((t) => t.id),
      ['treatment-b'],
      reason: 'patient A data must not survive the switch',
    );
  });

  test('a 404 from the server reports an invalid patient identity without '
      'wiping local data by itself', () async {
    await seedPatientA();
    syncService.setConnectivityForTesting(true);
    when(
      api.sync(
        sinceVersion: anyNamed('sinceVersion'),
        sinceScheduleVersion: anyNamed('sinceScheduleVersion'),
        limit: anyNamed('limit'),
        offset: anyNamed('offset'),
      ),
    ).thenThrow(ApiException(404, 'Pasien tidak ditemukan.'));

    SessionInvalidReason? reason;
    var calls = 0;
    syncService.onSessionInvalid = (value) async {
      reason = value;
      calls++;
    };

    await syncService.incrementalSync();
    await syncService.incrementalSync();

    expect(reason, SessionInvalidReason.patientNotFound);
    expect(calls, 1, reason: 'invalidation must be reported only once');
    expect(
      repository.getPatient(),
      isNotNull,
      reason: 'SyncService reports; the app owner performs the cleanup',
    );
  });

  test('a 401 reports an invalid session', () async {
    syncService.setConnectivityForTesting(true);
    when(
      api.sync(
        sinceVersion: anyNamed('sinceVersion'),
        sinceScheduleVersion: anyNamed('sinceScheduleVersion'),
        limit: anyNamed('limit'),
        offset: anyNamed('offset'),
      ),
    ).thenThrow(ApiException(401, 'Token tidak valid.'));

    SessionInvalidReason? reason;
    syncService.onSessionInvalid = (value) async => reason = value;

    await syncService.incrementalSync();

    expect(reason, SessionInvalidReason.unauthorized);
  });

  test('a connectivity failure never invalidates the session and keeps the '
      'offline cache', () async {
    await activationService.activate('CODE-A');
    await seedPatientA();
    syncService.setConnectivityForTesting(true);
    when(
      api.sync(
        sinceVersion: anyNamed('sinceVersion'),
        sinceScheduleVersion: anyNamed('sinceScheduleVersion'),
        limit: anyNamed('limit'),
        offset: anyNamed('offset'),
      ),
    ).thenThrow(
      ApiException(null, 'Terjadi gangguan koneksi. Periksa internet.'),
    );

    var called = false;
    syncService.onSessionInvalid = (_) async {
      called = true;
    };

    await syncService.incrementalSync();

    expect(called, isFalse);
    expect(repository.getPatient(), isNotNull);
    expect(syncService.syncStatus.lastError, isNotNull);
    expect(
      await activationService.isActivated(),
      isTrue,
      reason: 'offline must not log the patient out',
    );
  });
}
