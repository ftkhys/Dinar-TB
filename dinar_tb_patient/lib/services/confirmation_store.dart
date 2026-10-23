import 'package:flutter/foundation.dart';
import 'package:hive/hive.dart';
import 'package:dinar_tb_patient/models/adherence_history.dart';
import 'package:dinar_tb_patient/models/dose_confirmation.dart';
import 'package:dinar_tb_patient/utils/indo_date.dart';

/// Persists medicine confirmations keyed by (treatment course, Asia/Jakarta
/// calendar date).
///
/// This is the single source of truth for the Beranda "sudah diminum" state.
/// Because the key contains the WIB date, a new day never inherits yesterday's
/// confirmation, and because every read goes straight to the Hive box there is
/// no stale in-memory value to fall back on.
class ConfirmationStore {
  static const String boxName = 'dose_confirmations';

  Box<DoseConfirmation>? _box;

  /// Clock returning the current instant in Asia/Jakarta. Overridable so tests
  /// can exercise the WIB midnight rollover without waiting for real time.
  @visibleForTesting
  DateTime Function() jakartaNow;

  ConfirmationStore({DateTime Function()? jakartaNow})
    : jakartaNow = jakartaNow ?? IndoDate.nowJakarta;

  bool get isReady => _box != null;

  Future<void> init() async {
    _box = await Hive.openBox<DoseConfirmation>(boxName);
  }

  /// Today's date in Asia/Jakarta as `YYYY-MM-DD`.
  String todayWib() {
    final now = jakartaNow();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
  }

  String keyFor(String treatmentId, String wibDate) => '$treatmentId|$wibDate';

  /// The confirmation for [wibDate], optionally narrowed to a treatment course.
  DoseConfirmation? recordOn(String wibDate, {String? treatmentId}) {
    final box = _box;
    if (box == null) return null;
    if (treatmentId != null && treatmentId.isNotEmpty) {
      return box.get(keyFor(treatmentId, wibDate));
    }
    final suffix = '|$wibDate';
    for (final key in box.keys) {
      if (key.toString().endsWith(suffix)) {
        return box.get(key);
      }
    }
    return null;
  }

  bool isConfirmedOn(String wibDate, {String? treatmentId}) =>
      recordOn(wibDate, treatmentId: treatmentId) != null;

  /// Jakarta (WIB) time at which [wibDate] was confirmed, if any. Using the
  /// Jakarta zone rather than the device zone keeps the displayed "pukul HH.mm"
  /// correct even when the phone's clock is set to another timezone.
  DateTime? confirmedAtOn(String wibDate, {String? treatmentId}) {
    final raw = recordOn(wibDate, treatmentId: treatmentId)?.confirmedAtUtc;
    if (raw == null) return null;
    return IndoDate.parseIsoJakarta(raw);
  }

  bool isTodayConfirmed({String? treatmentId}) =>
      isConfirmedOn(todayWib(), treatmentId: treatmentId);

  DateTime? getTodayConfirmedAt({String? treatmentId}) =>
      confirmedAtOn(todayWib(), treatmentId: treatmentId);

  /// Records a confirmation for *today* (WIB). The first timestamp for the day
  /// wins, so a later sync reconciliation never rewrites history.
  Future<void> markConfirmed({
    required String treatmentId,
    String? window,
    DateTime? atUtc,
  }) async {
    final box = _box;
    if (box == null) return;
    final date = todayWib();
    final key = keyFor(treatmentId, date);
    final existing = box.get(key);
    final timestamp =
        existing?.confirmedAtUtc ??
        (atUtc ?? DateTime.now().toUtc()).toIso8601String();
    await box.put(
      key,
      DoseConfirmation(
        treatmentCourseId: treatmentId,
        wibDate: date,
        confirmedAtUtc: timestamp,
        window: existing?.window ?? window,
      ),
    );
  }

  /// Best-effort migration of the legacy single-value `confirmation_meta` box
  /// so an already-confirmed day survives the upgrade. Stored under an empty
  /// treatment id; the day-keyed lookup still finds it.
  Future<void> migrateLegacy(Box<dynamic> legacyBox) async {
    final box = _box;
    if (box == null) return;
    final date = legacyBox.get('confirmed_today_date') as String?;
    if (date == null) return;
    final key = keyFor('', date);
    if (box.containsKey(key)) return;
    final at = legacyBox.get('confirmed_today_at') as String?;
    await box.put(
      key,
      DoseConfirmation(
        treatmentCourseId: '',
        wibDate: date,
        confirmedAtUtc: at ?? DateTime.now().toUtc().toIso8601String(),
      ),
    );
  }

  /// If the backend reports today's (WIB) adherence as taken but this device
  /// has no record for today, adopt it so the button matches the server. Only
  /// ever touches today's date, never a previous day.
  Future<void> reconcileTodayFromAdherence(
    String treatmentId,
    AdherenceHistory history,
  ) async {
    if (treatmentId.isEmpty) return;
    final today = todayWib();
    for (final day in history.days) {
      if (day.date != today) continue;
      if (day.status != 'Sudah diminum') return;
      if (isConfirmedOn(today, treatmentId: treatmentId)) return;
      final at = day.confirmedAt == null
          ? null
          : DateTime.tryParse(day.confirmedAt!)?.toUtc();
      await markConfirmed(treatmentId: treatmentId, atUtc: at);
      return;
    }
  }

  Future<void> close() async {
    await _box?.close();
    _box = null;
  }

  /// Removes every cached confirmation. Used only when the session is ended so
  /// a different patient never inherits the previous patient's dose history.
  Future<void> clearAll() async {
    await _box?.clear();
  }
}
