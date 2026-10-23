import 'package:dio/dio.dart';
import 'package:dinar_tb_patient/models/models.dart';

/// Provides a fresh access token, or `null` when the app is not activated.
/// Implemented by `ActivationService`, which owns the device credential.
typedef TokenRefresher = Future<String?> Function();

/// Result of a successful `POST /activation/activate`.
class ActivationResult {
  const ActivationResult({
    required this.deviceId,
    required this.deviceCredential,
    required this.accessToken,
  });

  final String deviceId;
  final String deviceCredential;
  final String accessToken;
}

/// Error carrying the backend status code and a message safe to display.
class ApiException implements Exception {
  ApiException(this.statusCode, this.message);

  final int? statusCode;
  final String message;

  /// The server rejected the device session/credential.
  bool get isUnauthorized => statusCode == 401;

  /// The server explicitly says the patient/identity no longer exists.
  bool get isNotFound => statusCode == 404;

  /// A server answer that means the stored session can never be used again.
  /// A missing status (offline/timeout) is deliberately *not* included.
  bool get isSessionInvalid => isUnauthorized || isNotFound;

  @override
  String toString() => message;
}

class ApiClient {
  late final Dio _dio;
  String? _accessToken;
  TokenRefresher? _tokenRefresher;

  ApiClient({
    String baseUrl = const String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'https://mall-mine-duck-novels.trycloudflare.com',
    ),
    Dio? dio,
  }) {
    _dio =
        dio ??
        Dio(
          BaseOptions(
            baseUrl: baseUrl,
            connectTimeout: const Duration(seconds: 10),
            receiveTimeout: const Duration(seconds: 10),
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
          ),
        );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (baseUrl.startsWith('https://') &&
              !options.path.startsWith('/api/')) {
            options.path = '/api${options.path.startsWith('/') ? '' : '/'}'
                '${options.path}';
          }

          if (_accessToken != null) {
            options.headers['Authorization'] = 'Bearer $_accessToken';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          final request = error.requestOptions;
          final status = error.response?.statusCode;
          final isAuthEndpoint = request.path.contains('/activation/');
          final alreadyRetried = request.extra['authRetried'] == true;

          // A 401 on a protected patient endpoint means the access token expired
          // (or was invalidated). Refresh once and retry; concurrent callers share
          // a single refresh through ActivationService.
          if (status == 401 &&
              !isAuthEndpoint &&
              !alreadyRetried &&
              _tokenRefresher != null) {
            try {
              final token = await _tokenRefresher!();
              if (token != null) {
                request.extra['authRetried'] = true;
                request.headers['Authorization'] = 'Bearer $token';
                final response = await _dio.fetch(request);
                handler.resolve(response);
                return;
              }
            } catch (_) {
              // Refresh failed (e.g. invalid credential or offline); surface the
              // original 401 so the caller can react without looping.
            }
          }
          handler.next(error);
        },
      ),
    );
  }

  /// Wires the token refresher used by the 401 retry interceptor.
  void setTokenRefresher(TokenRefresher refresher) {
    _tokenRefresher = refresher;
  }

  void setAccessToken(String? token) {
    _accessToken = token;
  }

  String? get accessToken => _accessToken;

  /// One-time device activation. No bearer token is required for this call.
  Future<ActivationResult> activateDevice({
    required String activationCode,
    required String deviceIdentifier,
  }) async {
    try {
      final response = await _dio.post(
        '/activation/activate',
        data: {
          'activationCode': activationCode,
          'deviceIdentifier': deviceIdentifier,
        },
      );
      final data = response.data as Map<String, dynamic>;
      return ActivationResult(
        deviceId: data['deviceId'] as String,
        deviceCredential: data['deviceCredential'] as String,
        accessToken: data['accessToken'] as String,
      );
    } on DioException catch (error) {
      throw _toApiException(error);
    }
  }

  /// Exchanges a stored device credential for a fresh access token.
  Future<String> refreshDeviceToken({
    required String deviceId,
    required String deviceCredential,
  }) async {
    try {
      final response = await _dio.post(
        '/activation/refresh',
        data: {'deviceId': deviceId, 'deviceCredential': deviceCredential},
      );
      return (response.data as Map<String, dynamic>)['accessToken'] as String;
    } on DioException catch (error) {
      throw _toApiException(error);
    }
  }

  ApiException _toApiException(DioException error) {
    final status = error.response?.statusCode;
    final data = error.response?.data;
    String message =
        'Terjadi gangguan koneksi. Periksa internet lalu coba lagi.';
    if (data is Map) {
      final raw = data['message'];
      if (raw is String && raw.isNotEmpty) {
        message = raw;
      } else if (raw is List && raw.isNotEmpty) {
        message = raw.join(', ');
      }
    }
    return ApiException(status, message);
  }

  Future<SyncResponse> sync({
    int? sinceVersion,
    int? sinceScheduleVersion,
    String? sinceTimestamp,
    int? limit,
    int? offset,
  }) async {
    final queryParams = <String, dynamic>{};
    if (sinceVersion != null && sinceVersion > 0) {
      queryParams['sinceVersion'] = sinceVersion;
    }
    if (sinceScheduleVersion != null && sinceScheduleVersion > 0) {
      queryParams['sinceScheduleVersion'] = sinceScheduleVersion;
    }
    if (sinceTimestamp != null) {
      queryParams['sinceTimestamp'] = sinceTimestamp;
    }
    if (limit != null) {
      queryParams['limit'] = limit;
    }
    if (offset != null) {
      queryParams['offset'] = offset;
    }

    try {
      final response = await _dio.get(
        '/patient/me/sync',
        queryParameters: queryParams,
      );
      return SyncResponse.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (error) {
      throw _toApiException(error);
    }
  }

  Future<SyncResponse> getCurrentData() async {
    try {
      final response = await _dio.get('/patient/me');
      return SyncResponse.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (error) {
      throw _toApiException(error);
    }
  }

  Future<PatientProgress> getProgress() async {
    try {
      final response = await _dio.get('/patient/me/progress');
      return PatientProgress.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (error) {
      throw _toApiException(error);
    }
  }

  Future<void> registerFcmToken(String token) async {
    try {
      await _dio.post('/patient/device/fcm-token', data: {'token': token});
    } on DioException catch (error) {
      throw _toApiException(error);
    }
  }

  Future<AdherenceHistory> getAdherenceHistory(String treatmentId) async {
    try {
      final response = await _dio.get(
        '/patient/treatments/$treatmentId/adherence',
      );
      return AdherenceHistory.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (error) {
      throw _toApiException(error);
    }
  }

  Future<Map<String, dynamic>> confirmAdherenceOnline({
    required String treatmentId,
    required String operationId,
    required String adherenceDate,
    required String confirmedAt,
    required int expectedTreatmentVersion,
  }) async {
    try {
      final response = await _dio.post(
        '/patient/treatments/$treatmentId/adherence',
        data: {
          'operationId': operationId,
          'adherenceDate': adherenceDate,
          'confirmedAt': confirmedAt,
          'expectedTreatmentVersion': expectedTreatmentVersion,
        },
      );
      return response.data as Map<String, dynamic>;
    } on DioException catch (error) {
      throw _toApiException(error);
    }
  }

  Future<Map<String, dynamic>> syncAdherenceOperations({
    required List<AdherenceOperation> operations,
  }) async {
    try {
      final response = await _dio.post(
        '/patient/sync',
        data: {'operations': operations.map((op) => op.toJson()).toList()},
      );
      return response.data as Map<String, dynamic>;
    } on DioException catch (error) {
      throw _toApiException(error);
    }
  }
}
