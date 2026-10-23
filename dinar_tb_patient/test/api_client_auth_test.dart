import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dinar_tb_patient/services/api_client.dart';

class _ScriptedAdapter implements HttpClientAdapter {
  _ScriptedAdapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options, int callIndex)
  handler;
  int calls = 0;
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final index = calls;
    calls++;
    return handler(options, index);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(Map<String, dynamic> body, int status) {
  return ResponseBody.fromString(
    jsonEncode(body),
    status,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );
}

Map<String, dynamic> _syncBody() => {
  'patient': {
    'id': 'patient-1',
    'fullName': 'Budi',
    'registerNumber': 'REG-1',
    'address': 'Alamat',
    'version': 1,
  },
  'treatmentCourses': <dynamic>[],
  'controlSchedules': <dynamic>[],
  'reminderWindows': <dynamic>[],
  'serverTime': '2026-01-01T00:00:00.000Z',
  'hasMore': false,
  'maxVersion': 0,
};

ApiClient _clientWith(_ScriptedAdapter adapter) {
  final dio = Dio(BaseOptions(baseUrl: 'http://test.invalid'));
  dio.httpClientAdapter = adapter;
  return ApiClient(dio: dio);
}

void main() {
  test(
    'D4: a 401 on a patient endpoint refreshes the token once and retries',
    () async {
      var refreshes = 0;
      final adapter = _ScriptedAdapter((options, index) async {
        if (index == 0) return _json({'message': 'Token kedaluwarsa.'}, 401);
        return _json(_syncBody(), 200);
      });
      final client = _clientWith(adapter);
      client.setTokenRefresher(() async {
        refreshes++;
        client.setAccessToken('new-token');
        return 'new-token';
      });

      final result = await client.getCurrentData();

      expect(result.patient.id, 'patient-1');
      expect(result.patient.registerNumber, 'REG-1');
      expect(refreshes, 1);
      expect(adapter.calls, 2);
      expect(
        adapter.requests.last.headers['Authorization'],
        'Bearer new-token',
      );
    },
  );

  test(
    'D8: a 401 is not retried in a loop when no token can be produced',
    () async {
      final adapter = _ScriptedAdapter(
        (options, index) async => _json({'message': 'Token tidak valid.'}, 401),
      );
      final client = _clientWith(adapter);
      client.setTokenRefresher(() async => null); // not activated

      await expectLater(
        client.getCurrentData(),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 401)),
      );
      expect(adapter.calls, 1);
    },
  );

  test(
    'refresh failures on the activation endpoint are not intercepted as token expiry',
    () async {
      final adapter = _ScriptedAdapter(
        (options, index) async =>
            _json({'message': 'Kredensial device tidak berlaku.'}, 401),
      );
      final client = _clientWith(adapter);
      client.setTokenRefresher(() async => 'should-not-be-used');

      await expectLater(
        client.refreshDeviceToken(
          deviceId: 'device-1',
          deviceCredential: 'wrong',
        ),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 401)),
      );
      expect(adapter.calls, 1);
    },
  );
}
