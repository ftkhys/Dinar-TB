import 'package:flutter/foundation.dart';

/// Observable sync state shared with the UI so screens can show an honest
/// "sedang menyinkronkan / offline / gagal" indicator instead of silently
/// swallowing failures.
class SyncStatusNotifier extends ChangeNotifier {
  bool _isSyncing = false;
  bool _hasConnectivity = true;
  DateTime? _lastSyncAt;
  String? _lastError;
  int _pendingCount = 0;
  int _needsAttentionCount = 0;

  bool get isSyncing => _isSyncing;
  bool get hasConnectivity => _hasConnectivity;
  DateTime? get lastSyncAt => _lastSyncAt;
  String? get lastError => _lastError;
  int get pendingCount => _pendingCount;
  int get needsAttentionCount => _needsAttentionCount;

  void setSyncing(bool value) {
    if (_isSyncing == value) return;
    _isSyncing = value;
    notifyListeners();
  }

  void setConnectivity(bool value) {
    if (_hasConnectivity == value) return;
    _hasConnectivity = value;
    notifyListeners();
  }

  void setLastSyncAt(DateTime value) {
    _lastSyncAt = value;
    notifyListeners();
  }

  void setError(String? message) {
    if (_lastError == message) return;
    _lastError = message;
    notifyListeners();
  }

  void setCounts({required int pending, required int needsAttention}) {
    if (_pendingCount == pending && _needsAttentionCount == needsAttention) {
      return;
    }
    _pendingCount = pending;
    _needsAttentionCount = needsAttention;
    notifyListeners();
  }

  /// Clears transient state when a session ends, so the next activation does
  /// not inherit the previous patient's sync counters/errors.
  void reset() {
    _isSyncing = false;
    _lastError = null;
    _lastSyncAt = null;
    _pendingCount = 0;
    _needsAttentionCount = 0;
    notifyListeners();
  }
}
