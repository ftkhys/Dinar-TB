import 'package:dinar_tb_patient/services/api_client.dart';
import 'package:dinar_tb_patient/services/device_identity.dart';
import 'package:dinar_tb_patient/services/secure_store.dart';

/// Persisted device identity/credential for an activated installation.
class DeviceCredentials {
  const DeviceCredentials({
    required this.deviceIdentifier,
    required this.deviceId,
    required this.deviceCredential,
  });

  final String deviceIdentifier;
  final String deviceId;
  final String deviceCredential;
}

/// Owns the one-time activation lifecycle:
///
/// - generates and persists a stable per-installation `deviceIdentifier`
/// - activates with a staff-issued code and stores the device credential
/// - refreshes the short-lived access token without re-activation
///
/// The credential is written only to [SecureStore]; the access token lives in
/// memory inside [ApiClient] and is never persisted.
class ActivationService {
  ActivationService(this._store, this._api);

  final SecureStore _store;
  final ApiClient _api;

  static const String deviceIdentifierKey = 'device_identifier';
  static const String deviceIdKey = 'device_id';
  static const String deviceCredentialKey = 'device_credential';

  Future<String?> _read(String key) => _store.read(key);

  /// Returns the persisted credentials, or `null` when this install is not yet
  /// activated. Missing credential/device data means activation is required.
  Future<DeviceCredentials?> loadCredentials() async {
    final identifier = await _read(deviceIdentifierKey);
    final deviceId = await _read(deviceIdKey);
    final credential = await _read(deviceCredentialKey);
    if (identifier == null ||
        identifier.isEmpty ||
        deviceId == null ||
        deviceId.isEmpty ||
        credential == null ||
        credential.isEmpty) {
      return null;
    }
    return DeviceCredentials(
      deviceIdentifier: identifier,
      deviceId: deviceId,
      deviceCredential: credential,
    );
  }

  /// True when this installation already holds valid device credentials. This
  /// is independent of connectivity, so an offline start does not ask for a code.
  Future<bool> isActivated() async => (await loadCredentials()) != null;

  /// Returns the stable device identifier for this installation, creating it on
  /// first use. It is persisted so restarts never mint a new identity.
  Future<String> ensureDeviceIdentifier() async {
    final existing = await _read(deviceIdentifierKey);
    if (existing != null && existing.isNotEmpty) return existing;
    final created = generateDeviceIdentifier();
    await _store.write(deviceIdentifierKey, created);
    return created;
  }

  /// Completes the one-time activation using a staff-issued code.
  ///
  /// On success the device credential is persisted and the returned access
  /// token is installed on [ApiClient]. Throws [ApiException] on failure.
  Future<void> activate(String activationCode) async {
    final identifier = await ensureDeviceIdentifier();
    final result = await _api.activateDevice(
      activationCode: activationCode.trim(),
      deviceIdentifier: identifier,
    );
    await _store.write(deviceIdKey, result.deviceId);
    await _store.write(deviceCredentialKey, result.deviceCredential);
    _api.setAccessToken(result.accessToken);
  }

  Future<String?>? _refreshInFlight;

  /// Refreshes the access token, sharing a single in-flight request between
  /// concurrent callers so a burst of 401s cannot trigger a refresh storm.
  ///
  /// Returns the new token, or `null` when the install is not activated.
  /// Throws [ApiException] when the stored credential is rejected (e.g. the
  /// device was deactivated); throws a connection error when offline. The
  /// caller must treat these as non-fatal and keep local data intact.
  Future<String?> refreshAccessToken() {
    return _refreshInFlight ??= _performRefresh().whenComplete(() {
      _refreshInFlight = null;
    });
  }

  Future<String?> _performRefresh() async {
    final credentials = await loadCredentials();
    if (credentials == null) return null;
    final token = await _api.refreshDeviceToken(
      deviceId: credentials.deviceId,
      deviceCredential: credentials.deviceCredential,
    );
    _api.setAccessToken(token);
    return token;
  }

  /// Clears activation state. Used when the patient logs out or when the server
  /// permanently rejects the credential.
  ///
  /// The session (access token + device credential) is always removed. When
  /// [rotateDeviceIdentifier] is true the stable installation identifier is
  /// removed too, so the next activation registers a *new* device. That is what
  /// lets a patient switch accounts on the same installation: reusing the old
  /// identifier would make the backend reject the new code with a conflict
  /// because the identifier is still linked to the previous patient.
  Future<void> clearCredentials({bool rotateDeviceIdentifier = false}) async {
    _api.setAccessToken(null);
    await _store.delete(deviceIdKey);
    await _store.delete(deviceCredentialKey);
    if (rotateDeviceIdentifier) {
      await _store.delete(deviceIdentifierKey);
    }
  }
}
