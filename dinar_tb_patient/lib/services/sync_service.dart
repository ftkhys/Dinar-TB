import 'package:connectivity_plus/connectivity_plus.dart';
import 'dart:async';
import 'dart:math';
import 'package:hive/hive.dart';
import 'package:dinar_tb_patient/models/models.dart';
import 'package:dinar_tb_patient/repositories/schedule_repository.dart';
import 'package:dinar_tb_patient/services/api_client.dart';
import 'package:dinar_tb_patient/services/notification_service.dart';
import 'package:dinar_tb_patient/services/sync_status.dart';

/// Why the server rejected the stored patient session. Only produced from an
/// explicit server answer, never from a connectivity failure.
enum SessionInvalidReason {
  /// The device credential/access token is no longer accepted (401).
  unauthorized,

  /// The patient identity no longer exists on the server (404).
  patientNotFound,
}

typedef SessionInvalidCallback =
    Future<void> Function(SessionInvalidReason reason);

/// The real sync state of a medicine confirmation for one treatment/date, so
/// the UI can say "tersinkron" only once the server has actually accepted it.
enum AdherenceSyncState {
  /// No queued operation remains: the server has acknowledged it.
  synced,

  /// The confirmation is saved locally and still queued to be sent.
  pending,

  /// Repeated attempts failed; it is kept in the queue and needs attention.
  needsAttention,
}

class SyncService {
  final ApiClient _apiClient;
  final ScheduleRepository _repository;
  final NotificationService _notificationService;
  final Connectivity _connectivity;

  /// Observable status consumed by the UI (banner / indicator).
  final SyncStatusNotifier syncStatus;

  bool _isSyncing = false;
  bool _hasConnectivity = true;
  bool _isProcessingQueue = false;
  bool _suspended = false;
  bool _sessionInvalidReported = false;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;

  /// Called when the server explicitly invalidates the session (401/404). The
  /// app owner must clear the stored session and route to activation; offline
  /// errors never reach this callback.
  SessionInvalidCallback? onSessionInvalid;

  static const String _adherenceQueueBoxName = 'adherence_queue';
  static const int _maxAutoRetries = 5;

  Box<AdherenceOperation>? _adherenceQueueBox;

  SyncService({
    required this._apiClient,
    required this._repository,
    required this._notificationService,
    required this._connectivity,
    SyncStatusNotifier? status,
  }) : syncStatus = status ?? SyncStatusNotifier();

  Future<void> init() async {
    // Re-runnable so the same app instance can start a new session after logout
    // without restarting the process.
    _suspended = false;
    _sessionInvalidReported = false;
    await _connectivitySubscription?.cancel();
    _connectivitySubscription = null;

    // Initialize adherence queue box
    _adherenceQueueBox = await Hive.openBox<AdherenceOperation>(
      _adherenceQueueBoxName,
    );

    // Initialize connectivity monitoring
    final initialResults = await _connectivity.checkConnectivity();
    _hasConnectivity = _hasInternetConnection(initialResults);
    syncStatus.setConnectivity(_hasConnectivity);
    _connectivitySubscription = _connectivity.onConnectivityChanged.listen(
      _onConnectivityChanged,
    );

    final lastSync = _repository.getLastSyncTime();
    if (lastSync != null) syncStatus.setLastSyncAt(lastSync);
    _refreshStatusCounts();

    // Initial full sync on app start
    await fullSync();

    // Process any pending offline operations
    if (_hasConnectivity) {
      await _processAdherenceQueue();
    }

    // Reschedule notifications from local data
    await _rescheduleFromLocal();
  }

  void _refreshStatusCounts() {
    syncStatus.setCounts(
      pending: pendingAdherenceCount,
      needsAttention: needsAttentionCount,
    );
  }

  bool _hasInternetConnection(List<ConnectivityResult> results) {
    return results.isNotEmpty &&
        results.any((r) => r != ConnectivityResult.none);
  }

  void _onConnectivityChanged(List<ConnectivityResult> results) {
    if (_suspended) return;
    final hasConnectivity = _hasInternetConnection(results);
    final wasOffline = !_hasConnectivity;
    _hasConnectivity = hasConnectivity;
    syncStatus.setConnectivity(hasConnectivity);
    if (wasOffline && hasConnectivity) {
      // Connectivity restored - trigger sync and process queue
      incrementalSync();
      _processAdherenceQueue();
    }
  }

  Future<void> fullSync() async {
    if (_suspended || _isSyncing) return;
    if (!_hasConnectivity) return;
    _isSyncing = true;
    syncStatus.setSyncing(true);

    try {
      int offset = 0;
      const limit = 100;
      bool hasMore = true;
      int globalMaxVersion = 0;
      int globalMaxScheduleVersion = 0;
      String? nextTimestamp;
      final activeCourseIds = <String>{};

      while (hasMore) {
        final response = await _apiClient.sync(
          sinceVersion: 0,
          sinceScheduleVersion: 0,
          limit: limit,
          offset: offset,
        );

        // Use the first page's server time as the next cursor. It was captured
        // before any page query, so rows changed during pagination are fetched
        // again instead of being skipped.
        nextTimestamp ??= response.serverTime;
        activeCourseIds.addAll(await _applySyncResponse(response));
        globalMaxVersion = globalMaxVersion > response.maxVersion
            ? globalMaxVersion
            : response.maxVersion;
        globalMaxScheduleVersion =
            globalMaxScheduleVersion > response.maxScheduleVersion
            ? globalMaxScheduleVersion
            : response.maxScheduleVersion;
        hasMore = response.hasMore;
        offset += limit;
      }

      // A full sync is the only authoritative, complete snapshot of the
      // patient's courses, so it is the only place we prune local schedules
      // that no longer belong to an active course. The active ids are
      // accumulated across every page first, so schedules from an earlier page
      // are never deleted while processing a later page.
      await _repository.removeSchedulesNotIn(activeCourseIds.toList());

      if (globalMaxVersion > 0) {
        await _repository.setMaxVersion(globalMaxVersion);
      }
      if (globalMaxScheduleVersion > 0) {
        await _repository.setMaxScheduleVersion(globalMaxScheduleVersion);
      }
      if (nextTimestamp != null) {
        await _repository.setMaxSyncTimestamp(nextTimestamp);
      }

      await _syncProgress();

      // Re-derive every local notification from the freshly stored data. This
      // also covers reminder-time-only changes: the backend does not bump a
      // treatment version when only the settings changed, so the treatment
      // list can be empty on an incremental sync but the windows still update.
      await _rescheduleFromLocal();
      syncStatus.setError(null);
    } on ApiException catch (error) {
      if (await _reportInvalidSession(error)) return;
      // Offline / transient failure: keep the local cache, but record it so the
      // UI can say "data mungkin belum terbaru" instead of pretending success.
      syncStatus.setError(
        'Gagal menyinkronkan data. Menampilkan data tersimpan.',
      );
    } catch (_) {
      // Offline / transient failure: keep the local cache, but record it so the
      // UI can say "data mungkin belum terbaru" instead of pretending success.
      syncStatus.setError(
        'Gagal menyinkronkan data. Menampilkan data tersimpan.',
      );
    } finally {
      _isSyncing = false;
      syncStatus.setSyncing(false);
    }
  }

  Future<void> incrementalSync() async {
    if (_suspended || _isSyncing || !_hasConnectivity) return;
    _isSyncing = true;
    syncStatus.setSyncing(true);

    try {
      final maxVersion = _repository.getMaxVersion();
      final maxScheduleVersion = _repository.getMaxScheduleVersion();
      final maxTimestamp = _repository.getMaxSyncTimestamp();
      int offset = 0;
      const limit = 100;
      bool hasMore = true;
      int globalMaxVersion = maxVersion;
      int globalMaxScheduleVersion = maxScheduleVersion;
      String? nextTimestamp;

      while (hasMore) {
        final response = await _apiClient.sync(
          sinceVersion: maxVersion,
          sinceScheduleVersion: maxScheduleVersion,
          sinceTimestamp: maxTimestamp,
          limit: limit,
          offset: offset,
        );

        // The earliest response timestamp is the safe cursor: updates that
        // raced with a later page are then re-fetched rather than lost.
        nextTimestamp ??= response.serverTime;

        // An incremental response is a delta, not an authoritative list. Apply
        // it, but never prune local schedules from it: the absence of a course
        // or schedule here simply means "unchanged", not "deleted".
        await _applySyncResponse(response);
        globalMaxVersion = globalMaxVersion > response.maxVersion
            ? globalMaxVersion
            : response.maxVersion;
        globalMaxScheduleVersion =
            globalMaxScheduleVersion > response.maxScheduleVersion
            ? globalMaxScheduleVersion
            : response.maxScheduleVersion;
        hasMore = response.hasMore;
        offset += limit;
      }

      if (globalMaxVersion > maxVersion) {
        await _repository.setMaxVersion(globalMaxVersion);
      }
      if (globalMaxScheduleVersion > maxScheduleVersion) {
        await _repository.setMaxScheduleVersion(globalMaxScheduleVersion);
      }
      if (nextTimestamp != null) {
        await _repository.setMaxSyncTimestamp(nextTimestamp);
      }

      await _syncProgress();

      // Apply the latest reminder windows to the local notification schedule
      // right after a successful sync (e.g. admin moved 06:00 -> 08:00).
      await _rescheduleFromLocal();
      syncStatus.setError(null);
    } on ApiException catch (error) {
      if (await _reportInvalidSession(error)) return;
      syncStatus.setError(
        'Gagal menyinkronkan data. Menampilkan data tersimpan.',
      );
    } catch (_) {
      syncStatus.setError(
        'Gagal menyinkronkan data. Menampilkan data tersimpan.',
      );
    } finally {
      _isSyncing = false;
      syncStatus.setSyncing(false);
    }
  }

  /// Pulls the patient's control-visit history and adherence summary and caches
  /// them so Perkembangan/Riwayat screens work offline. Best-effort: a failure
  /// here does not invalidate the treatment/schedule sync that already applied.
  Future<void> _syncProgress() async {
    if (!_hasConnectivity || _suspended) return;
    try {
      final progress = await _apiClient.getProgress();
      await _repository.saveVisits(progress.visits);
      final treatmentId = progress.treatment?.id;
      if (treatmentId != null && progress.adherence != null) {
        await _repository.saveAdherenceHistory(
          treatmentId,
          progress.adherence!,
        );
        // Adopt a server-side confirmation for *today* so the button matches
        // the backend (e.g. confirmed on another device). Never touches a
        // previous day.
        await _notificationService.reconcileTodayFromAdherence(
          treatmentId,
          progress.adherence!,
        );
      }

      // A local confirmation that the server does not have yet (e.g. recorded
      // before the queue adapter was registered) would otherwise stay local
      // forever. Only queue it while the backend still reports today as open.
      if (treatmentId != null) {
        final today = _notificationService.todayWib();
        final takenToday =
            progress.adherence?.days.any(
              (day) => day.date == today && day.status == 'Sudah diminum',
            ) ??
            false;
        if (!takenToday) {
          await _notificationService.ensureTodayConfirmationQueued();
        }
      }
    } on ApiException catch (error) {
      if (await _reportInvalidSession(error)) return;
      // Non-fatal: cached progress remains visible.
      syncStatus.setError('Data perkembangan belum dapat diperbarui.');
    } catch (_) {
      // Non-fatal: cached progress remains visible.
      syncStatus.setError('Data perkembangan belum dapat diperbarui.');
    }
  }

  /// Applies one page of a sync response and returns the ids of the active
  /// treatment courses it contains.
  ///
  /// This method deliberately does NOT prune local schedules: pruning is only
  /// valid against a complete, authoritative snapshot, which is the job of
  /// [fullSync] after it has accumulated every page. It also does not move the
  /// version cursors, because a single page (or a delta) may report a lower max
  /// than what is already stored; the callers own the cursors.
  Future<List<String>> _applySyncResponse(SyncResponse response) async {
    // Save patient
    await _repository.savePatient(response.patient);

    // Save treatments
    await _repository.saveTreatments(response.treatmentCourses);

    // A completed course must not keep an upcoming control card on the device.
    // Full sync prunes these later, but incremental sync is a delta and does not
    // carry the completed course's schedule in its authoritative active set.
    for (final treatment in response.treatmentCourses) {
      if (treatment.isCompleted) {
        await _repository.deleteSchedule(treatment.id);
      }
    }

    // Save schedules (upsert by treatment course; never removes anything)
    await _repository.saveSchedules(response.controlSchedules);

    // Save reminder windows (replace-on-success; empty payload is a no-op)
    await _repository.saveReminderWindows(response.reminderWindows);

    // Save clinic identity so offline screens show the real facility name/phone
    if (response.clinicName != null) {
      await _repository.setClinic(response.clinicName, response.clinicPhone);
    }

    final syncedAt = DateTime.now();
    await _repository.setLastSyncTime(syncedAt);
    syncStatus.setLastSyncAt(syncedAt);

    return response.treatmentCourses
        .where((t) => t.isActive)
        .map((t) => t.id)
        .toList();
  }

  Future<void> _rescheduleFromLocal() async {
    try {
      // Staff archive/deactivation is authoritative once sync has delivered it.
      // Stop every local reminder (including a pending snooze) until the
      // patient is restored and a later sync clears archivedAt. A failed/offline
      // sync never reaches this branch, so the last known schedule keeps running.
      if (_repository.isPatientArchived) {
        await _notificationService.cancelAll();
        return;
      }

      final treatments = _repository.getAllTreatments();
      final schedules = _repository.getAllSchedules();

      // No local data at all: keep whatever notifications already exist (e.g.
      // an offline first launch must not wipe a previously applied schedule).
      if (treatments.isEmpty) return;

      // Use the last successfully stored windows; fall back to the product
      // defaults only when nothing has ever been synced. This keeps reminders
      // running on the last known configuration while offline.
      final reminderWindows = _repository.getReminderWindows();
      final windows = reminderWindows.isNotEmpty
          ? reminderWindows
          : [
              for (final window in defaultReminderWindows)
                ReminderWindow(start: window.start, end: window.end),
            ];

      await _notificationService.rescheduleAll(
        treatments: treatments,
        schedules: schedules,
        reminderWindows: windows,
      );
    } catch (_) {
      // Never let a scheduling failure crash startup/sync or wipe local data;
      // the previous notifications remain in place.
    }
  }

  /// Reports an explicit server invalidation (401/404) at most once, so a burst
  /// of failed requests cannot trigger repeated logouts. Returns true when the
  /// failure means the session is gone and normal offline handling must stop.
  ///
  /// A missing status code (offline/timeout/5xx) deliberately returns false:
  /// the app must keep working with its cached data.
  Future<bool> _reportInvalidSession(ApiException error) async {
    if (!error.isSessionInvalid) return false;
    if (_sessionInvalidReported) return true;
    _sessionInvalidReported = true;
    final callback = onSessionInvalid;
    if (callback != null) {
      await callback(
        error.isNotFound
            ? SessionInvalidReason.patientNotFound
            : SessionInvalidReason.unauthorized,
      );
    }
    return true;
  }

  /// Stops background work before a session's local data is removed.
  Future<void> suspend() async {
    _suspended = true;
    await _connectivitySubscription?.cancel();
    _connectivitySubscription = null;
  }

  /// Drops queued offline confirmations. Callers must warn the user first; this
  /// is never called silently by a normal sync.
  Future<void> clearQueuedOperations() async {
    await _adherenceQueueBox?.clear();
    _refreshStatusCounts();
  }

  // Add adherence operation to offline queue. Returns false when the queue is
  // unavailable (suspended session or a failed Hive box open) so the caller
  // never reports a confirmation as queued when it was not persisted.
  Future<bool> enqueueAdherenceOperation(AdherenceOperation operation) async {
    if (_suspended) return false;
    final box = _adherenceQueueBox;
    if (box == null) return false;
    await box.put(operation.operationId, operation);
    _refreshStatusCounts();

    // If online, try to process immediately
    if (_hasConnectivity) {
      await _processAdherenceQueue();
    }
    return true;
  }

  /// Persists an operation without waiting for the network.
  ///
  /// The UI confirmation path uses this so a slow or unreachable server cannot
  /// delay the local "sudah diminum" state. Call
  /// [processAdherenceQueueInBackground] afterwards to sync when possible.
  Future<bool> queueAdherenceOperation(AdherenceOperation operation) async {
    if (_suspended) return false;
    final box = _adherenceQueueBox;
    if (box == null) return false;
    await box.put(operation.operationId, operation);
    _refreshStatusCounts();
    return true;
  }

  /// Processes queued operations without making the caller await the network.
  void processAdherenceQueueInBackground() {
    if (!_hasConnectivity) return;
    unawaited(_processAdherenceQueue());
  }

  Future<void> _processAdherenceQueue() async {
    final box = _adherenceQueueBox;
    if (_isProcessingQueue || _suspended || !_hasConnectivity || box == null) {
      return;
    }
    if (box.isEmpty) return;

    _isProcessingQueue = true;

    try {
      final operations = box.values
          .where((op) => op.status == AdherenceOperationStatus.pending)
          .toList();

      // Sort by creation time (oldest first)
      operations.sort((a, b) => a.createdAt.compareTo(b.createdAt));

      for (final operation in operations) {
        if (!_hasConnectivity || _suspended) break;

        // Skip if max auto retries exceeded - mark as needsAttention instead of deleting
        if (operation.retryCount >= _maxAutoRetries) {
          if (operation.status == AdherenceOperationStatus.pending) {
            await box.put(
              operation.operationId,
              operation.copyWith(
                status: AdherenceOperationStatus.needsAttention,
              ),
            );
          }
          continue;
        }

        try {
          final result = await _apiClient.confirmAdherenceOnline(
            treatmentId: operation.treatmentCourseId,
            operationId: operation.operationId,
            adherenceDate: operation.adherenceDate,
            confirmedAt: operation.confirmedAt,
            expectedTreatmentVersion: operation.expectedTreatmentVersion,
          );

          // Check result code
          final code = result['code'] as String?;
          if (code == 'APPLIED' || code == 'DUPLICATE') {
            // Success - mark as completed and remove from queue
            await box.delete(operation.operationId);

            // Trigger incremental sync to get updated adherence data
            await incrementalSync();
          } else if (code == 'CONFLICT') {
            // Version conflict - create NEW operation with NEW operationId
            // Reusing the same operationId with different payload would cause
            // IDEMPOTENCY_KEY_REUSED error on backend (different requestHash)
            final server = result['server'];
            if (server != null && server['version'] != null) {
              final newVersion = server['version'] as int;

              // Mark old operation as completed (it has served its purpose - got the new version)
              await box.delete(operation.operationId);

              // Create new operation with new operationId but same adherence data
              final newOperation = AdherenceOperation(
                operationId: _generateOperationId(),
                treatmentCourseId: operation.treatmentCourseId,
                adherenceDate: operation.adherenceDate,
                confirmedAt: operation.confirmedAt,
                expectedTreatmentVersion: newVersion,
                retryCount: operation.retryCount + 1,
                createdAt: operation.createdAt,
                lastAttemptAt: DateTime.now(),
                status: AdherenceOperationStatus.pending,
              );
              await box.put(newOperation.operationId, newOperation);
            } else {
              // No version info - mark as needsAttention
              await box.put(
                operation.operationId,
                operation.copyWith(
                  status: AdherenceOperationStatus.needsAttention,
                  lastAttemptAt: DateTime.now(),
                ),
              );
            }
          } else {
            // Other error - increment retry count
            final updatedOp = operation.copyWith(
              retryCount: operation.retryCount + 1,
              lastAttemptAt: DateTime.now(),
            );
            await box.put(operation.operationId, updatedOp);
          }
        } catch (e) {
          // Network error - increment retry count and keep in queue
          final updatedOp = operation.copyWith(
            retryCount: operation.retryCount + 1,
            lastAttemptAt: DateTime.now(),
          );
          await box.put(operation.operationId, updatedOp);
        }
      }
    } finally {
      _isProcessingQueue = false;
      _refreshStatusCounts();
    }
  }

  /// Retry a specific operation by operationId.
  /// For operations with CONFLICT history, this will use the same operationId and payload.
  /// For operations marked as needsAttention, this resets the status to pending for reprocessing
  /// and resets the retry count to give a fresh attempt.
  Future<bool> retryOperation(String operationId) async {
    final box = _adherenceQueueBox;
    if (box == null) return false;
    final operation = box.get(operationId);
    if (operation == null) return false;

    // Only allow retry for needsAttention or pending operations
    if (operation.status == AdherenceOperationStatus.completed) {
      return false;
    }

    // Reset status to pending for reprocessing, and reset retry count for a fresh attempt
    await box.put(
      operationId,
      operation.copyWith(
        status: AdherenceOperationStatus.pending,
        retryCount: 0,
        lastAttemptAt: DateTime.now(),
      ),
    );

    // If online, trigger queue processing
    if (_hasConnectivity) {
      await _processAdherenceQueue();
    }
    _refreshStatusCounts();
    return true;
  }

  /// Retry all operations that need attention (reached max retries or failed)
  Future<int> retryAllNeedsAttention() async {
    final box = _adherenceQueueBox;
    if (box == null) return 0;
    final needsAttentionOps = box.values
        .where((op) => op.status == AdherenceOperationStatus.needsAttention)
        .toList();

    int retried = 0;
    for (final operation in needsAttentionOps) {
      final success = await retryOperation(operation.operationId);
      if (success) retried++;
    }
    return retried;
  }

  /// Get all operations that need manual attention
  List<AdherenceOperation> getOperationsNeedingAttention() {
    final box = _adherenceQueueBox;
    if (box == null) return [];
    return box.values
        .where((op) => op.status == AdherenceOperationStatus.needsAttention)
        .toList()
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
  }

  /// Get all pending operations (for UI display)
  List<AdherenceOperation> getPendingOperations() {
    final box = _adherenceQueueBox;
    if (box == null) return [];
    return box.values
        .where((op) => op.status == AdherenceOperationStatus.pending)
        .toList()
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
  }

  /// Get all operations in queue (for debugging)
  List<AdherenceOperation> getAllOperations() {
    final box = _adherenceQueueBox;
    if (box == null) return [];
    return box.values.toList()
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
  }

  /// User-initiated / lifecycle sync. Sends queued confirmations, retries the
  /// ones that already exhausted their automatic attempts (so the banner's
  /// "coba lagi" actually resends `needsAttention` operations, never only
  /// `pending` ones), then pulls the latest server state.
  Future<void> forceSync() async {
    if (_suspended || !_hasConnectivity) return;
    await retryAllNeedsAttention();
    await _processAdherenceQueue();
    await incrementalSync();
  }

  /// Whether an operation for [treatmentId] on [adherenceDate] is already in
  /// the persisted queue. Used to avoid queueing a second catch-up operation
  /// while the first one is still pending or awaiting manual retry.
  bool hasQueuedOperationFor(String treatmentId, String adherenceDate) {
    final box = _adherenceQueueBox;
    if (box == null || treatmentId.isEmpty) return false;
    return box.values.any(
      (op) =>
          op.treatmentCourseId == treatmentId &&
          op.adherenceDate == adherenceDate,
    );
  }

  /// Whether a confirmation for [treatmentId] on [adherenceDate] has been
  /// acknowledged by the server, is still waiting to be sent, or has failed
  /// enough times to need attention. Derived from the persisted queue, so it
  /// survives app restarts.
  AdherenceSyncState adherenceSyncStateFor(
    String treatmentId,
    String adherenceDate,
  ) {
    final box = _adherenceQueueBox;
    // Without the queue box the confirmation was never durably queued, so it
    // must never be reported as synced.
    if (box == null || treatmentId.isEmpty) {
      return AdherenceSyncState.needsAttention;
    }
    final matching = box.values
        .where(
          (op) =>
              op.treatmentCourseId == treatmentId &&
              op.adherenceDate == adherenceDate,
        )
        .toList();
    if (matching.isEmpty) return AdherenceSyncState.synced;
    if (matching.any(
      (op) => op.status == AdherenceOperationStatus.needsAttention,
    )) {
      return AdherenceSyncState.needsAttention;
    }
    return AdherenceSyncState.pending;
  }

  // Get count of pending operations
  int get pendingAdherenceCount =>
      _adherenceQueueBox?.values
          .where((op) => op.status == AdherenceOperationStatus.pending)
          .length ??
      0;

  int get needsAttentionCount =>
      _adherenceQueueBox?.values
          .where((op) => op.status == AdherenceOperationStatus.needsAttention)
          .length ??
      0;

  void dispose() {
    _connectivitySubscription?.cancel();
    _connectivitySubscription = null;
  }

  /// For testing: override connectivity state
  void setConnectivityForTesting(bool hasConnectivity) {
    _hasConnectivity = hasConnectivity;
  }

  /// Exposed for testing purposes
  Future<void> processQueueForTesting() async {
    await _processAdherenceQueue();
  }

  // Generate a UUID v4 for operationId
  String _generateOperationId() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    // Set version (4) and variant (RFC 4122)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}';
  }
}
