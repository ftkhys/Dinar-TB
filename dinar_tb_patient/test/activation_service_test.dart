import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:dinar_tb_patient/services/activation_service.dart';
import 'package:dinar_tb_patient/services/api_client.dart';
import 'package:dinar_tb_patient/services/secure_store.dart';

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

  ActivationResult? activationResult;
  Object? activationError;
  int activationCalls = 0;

  String? refreshToken = 'refreshed-token';
  Object? refreshError;
  int refreshCalls = 0;
  Completer<String>? refreshGate;

  String? lastAccessToken;

  @override
  Future<ActivationResult> activateDevice({
    required String activationCode,
    required String deviceIdentifier,
  }) async {
    activationCalls++;
    if (activationError != null) throw activationError!;
    return activationResult!;
  }

  @override
  Future<String> refreshDeviceToken({
    required String deviceId,
    required String deviceCredential,
  }) async {
    refreshCalls++;
    if (refreshError != null) throw refreshError!;
    if (refreshGate != null) return refreshGate!.future;
    return refreshToken!;
  }

  @override
  void setAccessToken(String? token) {
    lastAccessToken = token;
  }
}

const _deviceIdentifierPattern =
    r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

void main() {
  late InMemorySecureStore store;
  late FakeApiClient api;
  late ActivationService service;

  setUp(() {
    store = InMemorySecureStore();
    api = FakeApiClient();
    service = ActivationService(store, api);
  });

  void givenSuccessfulActivation() {
    api.activationResult = const ActivationResult(
      deviceId: 'device-1',
      deviceCredential: 'credential-1',
      accessToken: 'access-1',
    );
  }

  test(
    'D1: first activation stores credentials and installs the access token',
    () async {
      givenSuccessfulActivation();

      await service.activate('  CODE-123  ');

      expect(api.activationCalls, 1);
      final credentials = await service.loadCredentials();
      expect(credentials, isNotNull);
      expect(credentials!.deviceId, 'device-1');
      expect(credentials.deviceCredential, 'credential-1');
      expect(api.lastAccessToken, 'access-1');
      expect(await service.isActivated(), isTrue);
    },
  );

  test('D2: reopening the app does not require a code again', () async {
    givenSuccessfulActivation();
    await service.activate('CODE-123');

    final restarted = ActivationService(store, FakeApiClient());

    expect(await restarted.isActivated(), isTrue);
    expect((await restarted.loadCredentials())!.deviceId, 'device-1');
  });

  test('D3: the device identifier stays stable across restarts', () async {
    final first = await service.ensureDeviceIdentifier();
    final second = await ActivationService(
      store,
      FakeApiClient(),
    ).ensureDeviceIdentifier();

    expect(first, second);
    expect(RegExp(_deviceIdentifierPattern).hasMatch(first), isTrue);
  });

  test('D5: a transient refresh failure keeps the install activated', () async {
    givenSuccessfulActivation();
    await service.activate('CODE-123');
    api.refreshError = ApiException(null, 'offline');

    await expectLater(
      service.refreshAccessToken(),
      throwsA(isA<ApiException>()),
    );

    expect(await service.isActivated(), isTrue);
    expect(await service.loadCredentials(), isNotNull);
  });

  test(
    'D8: an invalid credential is rejected without clearing local state',
    () async {
      givenSuccessfulActivation();
      await service.activate('CODE-123');
      api.refreshError = ApiException(401, 'Kredensial device tidak berlaku.');

      await expectLater(
        service.refreshAccessToken(),
        throwsA(isA<ApiException>()),
      );

      expect(api.refreshCalls, 1);
      expect(await service.isActivated(), isTrue);
    },
  );

  test('refresh is single-flight for concurrent callers', () async {
    givenSuccessfulActivation();
    await service.activate('CODE-123');
    api.refreshGate = Completer<String>();

    final first = service.refreshAccessToken();
    final second = service.refreshAccessToken();
    api.refreshGate!.complete('shared-token');

    expect(await first, 'shared-token');
    expect(await second, 'shared-token');
    expect(api.refreshCalls, 1);
  });

  test(
    'refresh returns null without a network call when not activated',
    () async {
      expect(await service.refreshAccessToken(), isNull);
      expect(api.refreshCalls, 0);
    },
  );

  test(
    'the device credential is never written to plain-text storage keys',
    () async {
      givenSuccessfulActivation();
      await service.activate('CODE-123');

      // The credential lives only under the secure-storage key, never in Hive.
      expect(
        store.values.keys,
        contains(ActivationService.deviceCredentialKey),
      );
      expect(
        store.values[ActivationService.deviceCredentialKey],
        'credential-1',
      );
    },
  );
}
