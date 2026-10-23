import 'package:dinar_tb_patient/repositories/schedule_repository.dart';
import 'package:dinar_tb_patient/services/activation_service.dart';
import 'package:dinar_tb_patient/services/notification_service.dart';
import 'package:dinar_tb_patient/services/sync_service.dart';

/// Owns the transition between patient sessions on this installation.
///
/// Ending a session is strictly local: server-side patient data is never
/// deleted. Only the device credential, cached patient data, and queued
/// confirmations that belong to this installation are removed.
class SessionService {
  SessionService({
    required this.activationService,
    required this.repository,
    required this.syncService,
    required this.notificationService,
  });

  final ActivationService activationService;
  final ScheduleRepository repository;
  final SyncService syncService;
  final NotificationService notificationService;

  /// Unsynced confirmations (already timed out + still pending). The logout UI
  /// must warn the user before these are dropped.
  int get pendingSyncCount =>
      syncService.pendingAdherenceCount + syncService.needsAttentionCount;

  bool get hasUnsyncedData => pendingSyncCount > 0;

  /// Removes everything that belongs to the current patient while keeping the
  /// current activation credentials. Used right after a successful activation
  /// so cached data from a previous account can never leak into the new one.
  Future<void> clearPatientData() async {
    await notificationService.cancelAll();
    await notificationService.clearLocalConfirmationState();
    await syncService.clearQueuedOperations();
    await repository.clearAll();
    syncService.syncStatus.reset();
  }

  /// Ends the logged-in session. The installation identifier is rotated so the
  /// next activation registers a new device; reusing it would make the backend
  /// reject a code for a different patient with a conflict.
  Future<void> endSession() async {
    await syncService.suspend();
    await clearPatientData();
    await activationService.clearCredentials(rotateDeviceIdentifier: true);
  }
}
