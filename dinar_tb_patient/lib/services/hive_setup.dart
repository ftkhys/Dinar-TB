import 'package:hive/hive.dart';

import '../models/models.dart';

/// Registers every Hive adapter the app persists.
///
/// This lives in one place so the real app and the tests cannot drift apart:
/// forgetting the nested `AdherenceOperationStatusAdapter` (typeId 8) made
/// every adherence-queue write fail at runtime, silently keeping confirmations
/// on the device while the server never received them.
void registerHiveAdapters() {
  _register(PatientAdapter());
  _register(TreatmentCourseAdapter());
  _register(ControlScheduleAdapter());
  _register(SyncResponseAdapter());
  _register(ReminderWindowAdapter());
  _register(AdherenceHistoryAdapter());
  _register(AdherenceDayAdapter());
  _register(AdherenceOperationAdapter());
  _register(AdherenceOperationStatusAdapter());
  _register(VisitRecordAdapter());
  _register(DoseConfirmationAdapter());
}

void _register<T>(TypeAdapter<T> adapter) {
  if (!Hive.isAdapterRegistered(adapter.typeId)) {
    Hive.registerAdapter(adapter);
  }
}
