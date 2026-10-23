import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:workmanager/workmanager.dart';

import 'package:dinar_tb_patient/models/models.dart';
import 'package:dinar_tb_patient/repositories/schedule_repository.dart';
import 'package:dinar_tb_patient/services/hive_setup.dart';
import 'package:dinar_tb_patient/services/notification_service.dart';

/// Periodic maintenance only has to run often enough that the rolling 60-day
/// reminder horizon never runs out. Weekly execution leaves ample margin while
/// keeping battery/OS scheduling pressure low.
const String reminderMaintenanceTaskName = 'dinar_tb_reminder_maintenance';
const Duration reminderMaintenanceFrequency = Duration(days: 7);
const Duration reminderMaintenanceInitialDelay = Duration(days: 1);

/// Whether the local data still needs a reminder schedule. Archived patients
/// and completed/disabled courses must never be re-armed by background work.
@visibleForTesting
bool shouldMaintainReminderSchedule({
  required Patient? patient,
  required Iterable<TreatmentCourse> treatments,
}) {
  if (patient == null || patient.isArchived) return false;
  return treatments.any(
    (treatment) => treatment.isActive && treatment.remindersEnabled,
  );
}

/// Registers the periodic maintenance task. Safe to call on every startup:
/// WorkManager de-duplicates it by unique name.
Future<void> initializeReminderMaintenance() async {
  if (!Platform.isAndroid) return;
  try {
    await Workmanager().initialize(reminderMaintenanceDispatcher);
    await Workmanager().registerPeriodicTask(
      reminderMaintenanceTaskName,
      reminderMaintenanceTaskName,
      frequency: reminderMaintenanceFrequency,
      initialDelay: reminderMaintenanceInitialDelay,
      existingWorkPolicy: ExistingPeriodicWorkPolicy.keep,
    );
  } catch (error) {
    // Reminder scheduling already happens on launch/sync/resume. Failing to
    // register background maintenance must not prevent the app from starting.
    debugPrint('Could not register reminder maintenance: $error');
  }
}

/// Background entry point used by WorkManager. It reuses the same repository,
/// notification service, and boot receiver data as the foreground app so there
/// is no second recovery system.
@pragma('vm:entry-point')
void reminderMaintenanceDispatcher() {
  WidgetsFlutterBinding.ensureInitialized();
  Workmanager().executeTask((taskName, inputData) async {
    if (taskName != reminderMaintenanceTaskName) return true;
    return runReminderMaintenance();
  });
}

/// Extends the local reminder horizon from the last synced data without any
/// network call. Returns false only when the task should be retried.
Future<bool> runReminderMaintenance() async {
  try {
    await Hive.initFlutter();
    registerHiveAdapters();

    final repository = ScheduleRepository();
    await repository.init();

    final patient = repository.getPatient();
    final treatments = repository.getAllTreatments();
    if (!shouldMaintainReminderSchedule(
      patient: patient,
      treatments: treatments,
    )) {
      return true;
    }

    final notificationService = NotificationService();
    await notificationService.init();
    notificationService.setRepository(repository);

    // force=false keeps every still-valid alarm in place and only adds the new
    // tail of the rolling horizon (plus stale-ID reconciliation).
    await notificationService.refreshRoutineReminders();
    return !notificationService.hasReminderSchedulingFailure;
  } catch (error) {
    debugPrint('Reminder maintenance failed: $error');
    return false;
  }
}
