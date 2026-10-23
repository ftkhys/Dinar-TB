import 'package:flutter/foundation.dart'
    show debugPrint, kDebugMode, visibleForTesting;
import 'package:flutter/services.dart'
    show MissingPluginException, PlatformException;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:hive/hive.dart';
import 'dart:async' show TimeoutException;
import 'dart:convert';
import 'dart:math';
import 'package:timezone/timezone.dart' as tz;
import 'package:timezone/data/latest_all.dart' as tz;
import 'package:dinar_tb_patient/models/models.dart';
import 'package:dinar_tb_patient/repositories/schedule_repository.dart';
import 'package:dinar_tb_patient/services/confirmation_store.dart';
import 'package:dinar_tb_patient/utils/adherence_history_merge.dart';
import 'package:dinar_tb_patient/utils/indo_date.dart';
import 'package:dinar_tb_patient/services/sync_service.dart';
import 'dart:io' show Platform;

/// What actually happened when the patient pressed "Saya sudah minum obat".
/// The UI uses this to be honest about the difference between a record that is
/// safely stored on the device and one the server has acknowledged.
enum ConfirmOutcome {
  /// The local record was saved and the server acknowledged it.
  synced,

  /// The local record was saved; the confirmation is queued to sync later.
  pendingSync,

  /// The local record was saved, but repeated sync attempts failed and the
  /// operation needs attention. It is never dropped.
  needsAttention,

  /// The local record was saved without a sync operation (no treatment data or
  /// not activated yet).
  localOnly,

  /// Today's dose was already confirmed; nothing changed.
  alreadyConfirmed,
}

/// Formats [instant] as an ISO-8601 UTC string with exactly three fractional
/// digits (`YYYY-MM-DDTHH:mm:ss.sssZ`).
///
/// Dart's `DateTime.toIso8601String()` emits microsecond precision (six
/// fractional digits) on mobile, and drops the fraction entirely when the
/// milliseconds are zero. The backend validates the confirmation timestamp by
/// comparing `new Date(value).toISOString()` (always millisecond precision)
/// against the raw string, so both of those forms are rejected with HTTP 400
/// and the confirmation never reaches the server. Emitting a fixed three-digit
/// fraction keeps the string byte-identical to JavaScript's canonical output.
String isoMillisUtc(DateTime instant) {
  final utc = instant.toUtc();
  String two(int value) => value.toString().padLeft(2, '0');
  final year = utc.year.toString().padLeft(4, '0');
  final millis = utc.millisecond.toString().padLeft(3, '0');
  return '$year-${two(utc.month)}-${two(utc.day)}T${two(utc.hour)}:'
      '${two(utc.minute)}:${two(utc.second)}.${millis}Z';
}

/// A single dose reminder that should be registered with Android.
typedef DoseReminderPlan = ({String date, String window, tz.TZDateTime when});

/// Formats a Jakarta date as `YYYY-MM-DD` (used in notification keys/payloads).
@visibleForTesting
String formatWibDate(tz.TZDateTime date) {
  String two(int value) => value.toString().padLeft(2, '0');
  return '${date.year.toString().padLeft(4, '0')}-'
      '${two(date.month)}-${two(date.day)}';
}

/// Builds the one-off dose reminder plan for the rolling horizon.
///
/// Kept pure so the scheduling rules (skip today after confirmation, ignore
/// past windows, respect the treatment end date, and never exceed the horizon)
/// can be tested without an Android device.
///
/// When [followUpHorizonDays] is greater than zero the plan also contains the
/// evening follow-ups: starting [followUpInterval] after the last (evening)
/// window of each day and repeating until [followUpLastTime] WIB, never
/// crossing into the next day. They share the same date/window keys as the base
/// reminders, so the same confirmation/cancellation logic applies.
@visibleForTesting
List<DoseReminderPlan> buildDoseReminderPlan({
  required tz.TZDateTime now,
  required List<String> windows,
  required int horizonDays,
  required bool skipToday,
  required DateTime endDate,
  int followUpHorizonDays = 0,
  Duration followUpInterval = const Duration(minutes: 30),
  String followUpLastTime = '23:30',
}) {
  final plan = <DoseReminderPlan>[];

  ({int hour, int minute})? parseWindow(String window) {
    final parts = window.split(':');
    if (parts.length < 2) return null;
    final hour = int.tryParse(parts[0]);
    final minute = int.tryParse(parts[1]);
    if (hour == null || minute == null) return null;
    return (hour: hour, minute: minute);
  }

  final parsedWindows = <({int hour, int minute})>[];
  for (final window in windows) {
    final parsed = parseWindow(window);
    if (parsed != null) parsedWindows.add(parsed);
  }
  final lastWindow = parsedWindows.isEmpty
      ? null
      : parsedWindows.reduce(
          (a, b) =>
              (a.hour * 60 + a.minute) >= (b.hour * 60 + b.minute) ? a : b,
        );
  final lastTime = parseWindow(followUpLastTime);

  for (var offset = 0; offset <= horizonDays; offset++) {
    if (offset == 0 && skipToday) continue;

    final day = tz.TZDateTime(tz.local, now.year, now.month, now.day + offset);
    final dateKey = formatWibDate(day);

    for (var i = 0; i < windows.length; i++) {
      final parsed = parseWindow(windows[i]);
      if (parsed == null) continue;

      final when = tz.TZDateTime(
        tz.local,
        day.year,
        day.month,
        day.day,
        parsed.hour,
        parsed.minute,
      );

      if (!when.isAfter(now)) continue;
      if (when.isAfter(endDate)) continue;

      plan.add((date: dateKey, window: windows[i], when: when));
    }

    // Follow-ups always trail the last window of the day, even when that
    // window already passed (the patient may confirm late in the evening). They
    // are clamped to [followUpLastTime] on the same WIB date so a reminder can
    // never leak past midnight into the next day.
    if (followUpHorizonDays <= 0 ||
        offset > followUpHorizonDays ||
        lastWindow == null ||
        lastTime == null ||
        followUpInterval <= Duration.zero) {
      continue;
    }

    final lastAllowed = tz.TZDateTime(
      tz.local,
      day.year,
      day.month,
      day.day,
      lastTime.hour,
      lastTime.minute,
    );
    var when = tz.TZDateTime(
      tz.local,
      day.year,
      day.month,
      day.day,
      lastWindow.hour,
      lastWindow.minute,
    ).add(followUpInterval);

    while (!when.isAfter(lastAllowed)) {
      if (when.isAfter(now) && !when.isAfter(endDate)) {
        plan.add((date: dateKey, window: formatWibTime(when), when: when));
      }
      when = when.add(followUpInterval);
    }
  }

  return plan;
}

/// Formats a Jakarta time as `HH:mm` (used as the follow-up window key).
@visibleForTesting
String formatWibTime(tz.TZDateTime date) {
  String two(int value) => value.toString().padLeft(2, '0');
  return '${two(date.hour)}:${two(date.minute)}';
}

/// Stable, deterministic notification ID for a per-date dose reminder. A
/// reschedule after an app restart therefore reuses the same Android alarm
/// instead of registering a duplicate.
@visibleForTesting
int doseNotificationId({
  required String treatmentId,
  required String date,
  required String window,
}) =>
    'dose:${NotificationService._schedulingVersion}:$treatmentId:$date:$window'
        .hashCode &
    0x7FFFFFFF;

/// Stable notification ID for a treatment's snooze.
///
/// Deliberately independent of the requested time: a second snooze replaces the
/// first instead of stacking, and the app can cancel it by ID even when the
/// platform cannot list pending notifications.
@visibleForTesting
int snoozeNotificationId(String treatmentId) =>
    'snooze:${NotificationService._schedulingVersion}:$treatmentId'.hashCode &
    0x7FFFFFFF;

/// The snooze target, notification ID and payload for "Ingatkan dalam 30 menit
/// lagi". Shared by the in-app button and the background notification action.
@visibleForTesting
({int id, tz.TZDateTime when, String payload}) buildSnoozePlan({
  required tz.TZDateTime now,
  required String treatmentId,
  Duration delay = const Duration(minutes: 30),
}) {
  final when = now.add(delay);
  return (
    id: snoozeNotificationId(treatmentId),
    when: when,
    payload:
        '{"type":"dose_reminder","treatmentId":"$treatmentId","window":"snooze"}',
  );
}

/// Whether a snooze taken [now] would land on the next WIB calendar day.
///
/// A snooze must never resurrect the previous day's reminder after midnight, so
/// callers refuse to schedule one when this returns true.
@visibleForTesting
bool snoozeWouldCrossWibMidnight({
  required tz.TZDateTime now,
  Duration delay = const Duration(minutes: 30),
}) {
  final target = now.add(delay);
  return target.year != now.year ||
      target.month != now.month ||
      target.day != now.day;
}

/// Reads the notification-permission probe for the snooze flow with a bounded
/// wait. A hanging or failing platform channel must not block scheduling; the
/// result only affects the wording of the success message, so it defaults to
/// "enabled" and lets the scheduler try.
Future<bool> notificationsEnabledForSnooze(
  Future<bool> Function() probe, {
  Duration timeout = const Duration(seconds: 3),
}) async {
  try {
    return await probe().timeout(timeout);
  } catch (_) {
    return true;
  }
}

/// Action id for the "Ingatkan dalam 30 menit lagi" button attached to every
/// dose reminder. The action does not open the UI; it is handled on a
/// background isolate so the snooze works even when the app is closed.
const String snoozeActionId = 'dinar_tb_snooze_30';

/// Reminder windows used when the repository has none. Scheduling and
/// cancellation share this list so a confirmation always cancels the alarms
/// that were actually registered.
const List<({String start, String end})> defaultReminderWindows = [
  (start: '06:00', end: '07:00'),
  (start: '20:00', end: '21:00'),
];

/// Bundled raw resource played by the dose channel. The file is exactly 15
/// seconds long, so Android stops the sound on its own after that; cancelling
/// the notification also stops it on stock Android. A custom channel is
/// required because Android freezes a channel's sound when it is first created.
const String doseNotificationSound = 'dinar_reminder_15s';

const AndroidNotificationChannel doseNotificationChannel =
    AndroidNotificationChannel(
      NotificationService._doseChannelId,
      NotificationService._doseChannelName,
      description: NotificationService._doseChannelDescription,
      importance: Importance.high,
      playSound: true,
      sound: RawResourceAndroidNotificationSound(doseNotificationSound),
      enableVibration: true,
      showBadge: true,
      audioAttributesUsage: AudioAttributesUsage.notification,
    );

const AndroidNotificationChannel controlNotificationChannel =
    AndroidNotificationChannel(
      NotificationService._controlChannelId,
      NotificationService._controlChannelName,
      description: NotificationService._controlChannelDescription,
      importance: Importance.high,
      playSound: true,
      enableVibration: true,
      showBadge: true,
      audioAttributesUsage: AudioAttributesUsage.notification,
    );

/// Shared presentation for dose reminders, snoozes and test notifications.
/// The attached [snoozeActionId] action re-schedules the same reminder 30
/// minutes later via [notificationBackgroundResponseHandler].
const NotificationDetails doseNotificationDetails = NotificationDetails(
  android: AndroidNotificationDetails(
    NotificationService._doseChannelId,
    NotificationService._doseChannelName,
    channelDescription: NotificationService._doseChannelDescription,
    importance: Importance.high,
    priority: Priority.high,
    playSound: true,
    enableVibration: true,
    audioAttributesUsage: AudioAttributesUsage.notification,
    // Show on the lock screen with full content (never "konten disembunyikan").
    visibility: NotificationVisibility.public,
    ticker: 'Pengingat minum obat',
    category: AndroidNotificationCategory.reminder,
    icon: 'ic_stat_dinar',
    actions: <AndroidNotificationAction>[
      AndroidNotificationAction(
        snoozeActionId,
        'Ingatkan dalam 30 menit lagi',
        showsUserInterface: false,
        cancelNotification: true,
      ),
    ],
  ),
  iOS: DarwinNotificationDetails(
    presentAlert: true,
    presentBadge: true,
    presentSound: true,
  ),
);

const NotificationDetails controlNotificationDetails = NotificationDetails(
  android: AndroidNotificationDetails(
    NotificationService._controlChannelId,
    NotificationService._controlChannelName,
    channelDescription: NotificationService._controlChannelDescription,
    importance: Importance.high,
    priority: Priority.high,
    playSound: true,
    enableVibration: true,
    audioAttributesUsage: AudioAttributesUsage.notification,
    visibility: NotificationVisibility.public,
    ticker: 'Pengingat jadwal kontrol',
    category: AndroidNotificationCategory.reminder,
    icon: 'ic_stat_dinar',
  ),
  iOS: DarwinNotificationDetails(
    presentAlert: true,
    presentBadge: true,
    presentSound: true,
  ),
);

/// Diagnostic details for the most recent snooze attempt. The patient only
/// sees a simple message; the concrete platform error stays available in logs
/// and tests so a non-permission failure is never misreported as one.
abstract final class SnoozeDiagnostics {
  static String? lastFailure;
  static String? lastWarning;

  static void reset() {
    lastFailure = null;
    lastWarning = null;
  }

  static void recordFailure(String stage, Object error) {
    lastFailure = '$stage: ${error.runtimeType}: $error';
    debugPrint('Snooze diagnostic [$stage]: $error');
  }

  static void recordWarning(String stage, Object error) {
    lastWarning = '$stage: ${error.runtimeType}: $error';
    debugPrint('Snooze diagnostic [$stage]: $error');
  }
}

/// Simple, non-accusatory text for a real scheduling failure. Only an exact
/// alarm rejection mentions a permission because only that case is one.
String snoozeFailurePatientMessage(Object error) {
  if (error is TimeoutException) {
    return 'layanan notifikasi tidak merespons';
  }
  if (error is MissingPluginException) {
    return 'layanan notifikasi belum siap, tutup lalu buka kembali aplikasi';
  }
  if (error is PlatformException) {
    if (error.code == 'exact_alarms_not_permitted') {
      return 'izin "Alarm & pengingat" belum aktif';
    }
    return 'sistem notifikasi menolak permintaan';
  }
  if (error is StateError) {
    return 'sistem Android belum mendaftarkan alarm';
  }
  return 'terjadi kendala pada layanan notifikasi';
}

/// Scheduler used by [notificationBackgroundResponseHandler]. Overridable in
/// tests so the action dispatch can be verified without an Android device.
@visibleForTesting
Future<bool> Function(String? payload) snoozeScheduleAction =
    scheduleSnoozeInBackground;

/// User-visible fallback used when the background snooze could not be
/// registered. Overridable in tests so no platform channel is needed.
@visibleForTesting
Future<void> Function(String message) snoozeFailureReporter =
    showBackgroundSnoozeFailure;

/// Entry point invoked by the notification plugin on a background isolate when
/// the patient taps the "Ingatkan dalam 30 menit lagi" action while the app is
/// closed or in the background. Kept self-contained (no Hive, no services) so
/// it can run in a fresh isolate.
@pragma('vm:entry-point')
Future<void> notificationBackgroundResponseHandler(
  NotificationResponse response,
) async {
  if (response.actionId != snoozeActionId) return;

  bool scheduled;
  try {
    scheduled = await snoozeScheduleAction(response.payload);
  } catch (error) {
    debugPrint('Background snooze action failed: $error');
    scheduled = false;
  }

  if (scheduled) return;

  // The background isolate has no UI, so surface a real failure instead of
  // silently logging it.
  try {
    await snoozeFailureReporter(
      'Pengingat 30 menit belum bisa dijadwalkan. '
      'Buka Dinar-TB lalu coba lagi.',
    );
  } catch (error) {
    debugPrint('Could not report the snooze failure: $error');
  }
}

const int _snoozeFailureNotificationId = 900003;

const NotificationDetails _snoozeFailureDetails = NotificationDetails(
  android: AndroidNotificationDetails(
    NotificationService._doseChannelId,
    NotificationService._doseChannelName,
    channelDescription: NotificationService._doseChannelDescription,
    importance: Importance.high,
    priority: Priority.high,
    visibility: NotificationVisibility.public,
    ticker: 'Pengingat gagal dijadwalkan',
    category: AndroidNotificationCategory.reminder,
    icon: 'ic_stat_dinar',
  ),
);

/// Shows an immediate local notification about a failed background snooze.
Future<void> showBackgroundSnoozeFailure(String message) async {
  try {
    tz.initializeTimeZones();
    tz.setLocalLocation(tz.getLocation('Asia/Jakarta'));

    final plugin = FlutterLocalNotificationsPlugin();
    await plugin.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('ic_stat_dinar'),
      ),
    );
    final android = plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    await android?.createNotificationChannel(doseNotificationChannel);
    await plugin.show(
      _snoozeFailureNotificationId,
      'Pengingat gagal dijadwalkan',
      message,
      _snoozeFailureDetails,
    );
  } catch (error) {
    debugPrint('Could not show the snooze failure notification: $error');
  }
}

/// Schedules a one-off "minum obat" reminder 30 minutes from now. Safe to call
/// from the main isolate or the notification background isolate.
Future<bool> scheduleSnoozeInBackground(String? payload) async {
  SnoozeDiagnostics.reset();
  try {
    tz.initializeTimeZones();
    tz.setLocalLocation(tz.getLocation('Asia/Jakarta'));

    final plugin = FlutterLocalNotificationsPlugin();
    const InitializationSettings initSettings = InitializationSettings(
      android: AndroidInitializationSettings('ic_stat_dinar'),
      iOS: DarwinInitializationSettings(),
    );
    await plugin.initialize(initSettings);
    final android = plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    await android?.createNotificationChannel(doseNotificationChannel);

    final treatmentId = _treatmentIdFromPayload(payload) ?? '';

    // A snooze from late in the evening could otherwise fire after midnight and
    // resurrect the previous day's reminder.
    if (snoozeWouldCrossWibMidnight(now: tz.TZDateTime.now(tz.local))) {
      debugPrint('Snooze ignored: it would cross WIB midnight.');
      return true;
    }

    final plan = buildSnoozePlan(
      now: tz.TZDateTime.now(tz.local),
      treatmentId: treatmentId,
    );

    // Cancel the previous snooze by its deterministic ID. This does not depend
    // on the platform being able to list pending notifications.
    try {
      await plugin.cancel(plan.id);
    } catch (error) {
      debugPrint('Could not cancel the previous snooze by id: $error');
    }

    // Best effort: also drop legacy time-based snoozes left by older builds.
    // Bounded so an unresponsive platform cache can never block the new alarm.
    try {
      final pending = await plugin.pendingNotificationRequests().timeout(
        const Duration(seconds: 1),
      );
      for (final scheduled in pending) {
        final value = scheduled.payload;
        if (value != null &&
            value.contains('"window":"snooze"') &&
            value.contains('"treatmentId":"$treatmentId"')) {
          await plugin.cancel(scheduled.id);
        }
      }
    } catch (error) {
      debugPrint('Could not enumerate pending snoozes: $error');
    }

    AndroidScheduleMode mode = AndroidScheduleMode.inexactAllowWhileIdle;
    try {
      if (await android?.canScheduleExactNotifications() ?? false) {
        mode = AndroidScheduleMode.exactAllowWhileIdle;
      }
    } catch (error) {
      // A failing capability probe must not prevent the reminder.
      debugPrint('Exact-alarm probe failed, using inexact: $error');
    }

    Future<void> schedule(AndroidScheduleMode scheduleMode) =>
        plugin.zonedSchedule(
          plan.id,
          'Pengingat minum obat',
          'Konfirmasi minum obat hari ini belum tercatat. '
              'Buka aplikasi Dinar-TB untuk konfirmasi.',
          plan.when,
          doseNotificationDetails,
          androidScheduleMode: scheduleMode,
          uiLocalNotificationDateInterpretation:
              UILocalNotificationDateInterpretation.absoluteTime,
          payload: plan.payload,
        );

    try {
      await schedule(mode);
    } on PlatformException {
      // Mirror the foreground path: retry once as inexact when an OEM rejects
      // the exact request for a reason other than the documented error code.
      if (mode == AndroidScheduleMode.inexactAllowWhileIdle) rethrow;
      await schedule(AndroidScheduleMode.inexactAllowWhileIdle);
    }

    // A successful zonedSchedule is authoritative. The pending list can lag
    // behind right after scheduling (especially in a fresh background isolate),
    // so a cache miss is diagnostic only. Treating it as failure made the app
    // report a permission problem after the alarm had already been registered.
    try {
      final pending = await plugin.pendingNotificationRequests().timeout(
        const Duration(seconds: 1),
      );
      if (!pending.any((request) => request.id == plan.id)) {
        SnoozeDiagnostics.recordWarning(
          'background-pending-cache',
          StateError('id ${plan.id} not listed immediately after schedule'),
        );
      }
    } catch (error) {
      SnoozeDiagnostics.recordWarning('background-pending-read', error);
    }
    return true;
  } catch (error) {
    SnoozeDiagnostics.recordFailure('background-schedule', error);
    return false;
  }
}

String? _treatmentIdFromPayload(String? payload) {
  if (payload == null) return null;
  try {
    final decoded = jsonDecode(payload);
    if (decoded is Map && decoded['treatmentId'] is String) {
      return decoded['treatmentId'] as String;
    }
  } catch (_) {
    return null;
  }
  return null;
}

class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  final FlutterLocalNotificationsPlugin _notifications =
      FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  // Notification ID tracking
  final Map<String, int> _notificationIds = {};

  // Channel IDs are versioned. Android permanently freezes a channel's
  // importance and sound the first time it is created, so an existing
  // `dose_reminder` channel (possibly created with default importance or a
  // silent sound by an older build) cannot be repaired in place. Publishing a
  // new ID guarantees a fresh, correctly configured channel; the migration
  // step below cancels the old scheduled reminders and recreates them on the
  // new channel.
  static const String _doseChannelId = 'dose_reminder_v3';
  static const String _doseChannelName = 'Pengingat Minum Obat';
  static const String _doseChannelDescription =
      'Notifikasi pengingat minum obat harian';
  static const String _controlChannelId = 'control_reminder_v2';
  static const String _controlChannelName = 'Pengingat Kontrol';
  static const String _controlChannelDescription =
      'Notifikasi pengingat jadwal kontrol ke Puskesmas';

  // Part of every routine reminder key. Changing it during a channel migration
  // makes the new reminders use new notification IDs, so the reconciliation in
  // [rescheduleAll] can remove the old ones instead of matching their IDs and
  // leaving them on the legacy channel.
  static const String _schedulingVersion = 'v3';

  // One-off alarms are scheduled this many days ahead. Android does not allow
  // a calendar-time daily repeat (the plugin only matches the time of day, so
  // "skip today" is impossible), and predictable one-off alarms let the app
  // skip today's reminder after a confirmation while keeping future days. The
  // horizon is refreshed on every launch/sync (and again on every app resume),
  // so it only runs out if the patient never opens the app for this many days.
  static const int _reminderHorizonDays = 60;

  // The evening follow-ups (every 30 minutes after the last window until 23:30)
  // are only scheduled this many days ahead. Android limits the number of
  // pending exact alarms per app, and unlike the two base reminders the
  // follow-ups are only useful while the patient is awake, so a much shorter
  // horizon is enough. It is topped up on every launch/sync/resume too.
  static const int _followUpHorizonDays = 14;
  static const String _followUpLastTime = '23:30';
  static const Duration _followUpInterval = Duration(minutes: 30);

  static const int _testNotificationId = 900001;
  static const int _testScheduledNotificationId = 900002;

  static const String _setupBoxName = 'notification_setup';
  static const String _setupSeenKey = 'permission_setup_seen_v1';
  static const String _scheduledAlarmIdsKey = 'scheduled_routine_alarm_ids_v1';
  Box<dynamic>? _setupBox;

  // IDs of routine alarms registered by the previous reschedule. Persisting
  // them lets the next reschedule cancel old officer-configured times even when
  // Android's pending-notification cache cannot be read. Snoozes and test
  // notifications are deliberately not part of this ledger.
  Set<int>? _scheduledAlarmIds;

  // Number of alarms that the most recent reschedule failed to register. This
  // is deliberately kept separate from a failed pending-list read: the list is
  // only an optimisation, while a rejected zonedSchedule call means the patient
  // may not be reminded at all.
  int _lastSchedulingFailureCount = 0;

  /// Whether the most recent reschedule could not register one or more alarms.
  bool get hasReminderSchedulingFailure => _lastSchedulingFailureCount > 0;

  // Confirmation state, keyed by (treatment course, WIB date). This replaces
  // the previous single global "last confirmed date", which could leak
  // yesterday's status into a new day.
  final ConfirmationStore _confirmations = ConfirmationStore();

  // Legacy single-value confirmation box, migrated into [_confirmations] on
  // init and kept only for backward compatibility.
  static const String _confirmationBoxName = 'confirmation_meta';
  Box<dynamic>? _legacyConfirmationBox;

  /// Called when the user taps a notification (or the app is opened from one).
  /// `payload` is the raw JSON payload, or null for the cold-start default.
  void Function(String? payload)? onNotificationTap;

  /// Called synchronously right after a medicine confirmation has been written
  /// to local storage, *before* any notification cleanup or network sync. The UI
  /// uses it to refresh immediately instead of waiting for a slow/offline
  /// server round trip.
  void Function()? onLocalConfirmation;

  /// Payload of the notification that launched the app, if any. Read by
  /// `main.dart` once the navigator is ready.
  String? initialNotificationPayload;

  // Sync service reference for offline queue
  SyncService? _syncService;

  // Repository reference for getting treatment info
  ScheduleRepository? _repository;

  Future<void> init() async {
    if (_initialized) return;

    tz.initializeTimeZones();
    tz.setLocalLocation(tz.getLocation('Asia/Jakarta'));

    // Initialize confirmation storage and migrate the legacy single-value box.
    await _confirmations.init();
    _legacyConfirmationBox = await Hive.openBox(_confirmationBoxName);
    await _confirmations.migrateLegacy(_legacyConfirmationBox!);
    _setupBox = await Hive.openBox(_setupBoxName);

    // A dedicated monochrome drawable. Using the adaptive launcher icon here can
    // make notifications fail to render on Android 12+ (the small icon must be a
    // bitmap/vector silhouette, not a launcher icon).
    const AndroidInitializationSettings androidSettings =
        AndroidInitializationSettings('ic_stat_dinar');

    const DarwinInitializationSettings iosSettings =
        DarwinInitializationSettings(
          requestAlertPermission: true,
          requestBadgePermission: true,
          requestSoundPermission: true,
        );

    const InitializationSettings initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _notifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: _onNotificationTap,
      onDidReceiveBackgroundNotificationResponse:
          notificationBackgroundResponseHandler,
    );

    // Capture a notification tap that cold-started the app.
    final launchDetails = await _notifications
        .getNotificationAppLaunchDetails();
    if (launchDetails?.didNotificationLaunchApp ?? false) {
      initialNotificationPayload = launchDetails?.notificationResponse?.payload;
    }

    // Create notification channels for Android
    await _createNotificationChannels();

    _initialized = true;
  }

  AndroidFlutterLocalNotificationsPlugin? get _androidPlugin => _notifications
      .resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin
      >();

  /// Whether the OS currently allows exact alarms. Uses the notification
  /// plugin's own check (backed by `AlarmManager.canScheduleExactAlarms()`),
  /// which is authoritative on Android 12+; reading it through a generic
  /// permission plugin can report the wrong value and make scheduling throw.
  Future<bool> _canScheduleExactAlarms() async {
    if (!Platform.isAndroid) return true;
    try {
      return await _androidPlugin?.canScheduleExactNotifications() ?? false;
    } catch (error) {
      // The probe itself can fail on some OEM builds. That must not block
      // scheduling: an inexact alarm is a perfectly valid fallback.
      debugPrint('Failed to read exact-alarm capability: $error');
      return false;
    }
  }

  /// Opens the "Alarm & pengingat" system screen on Android 12+ and returns
  /// whether exact alarms are granted afterwards.
  Future<bool> _requestExactAlarmPermission() async {
    if (!Platform.isAndroid) return true;
    return await _androidPlugin?.requestExactAlarmsPermission() ?? false;
  }

  /// Schedules a local notification, preferring an exact alarm but transparently
  /// falling back to an inexact one when the OS refuses exact alarms.
  ///
  /// This fallback is essential: on Android 12+ `zonedSchedule` throws
  /// `PlatformException(exact_alarms_not_permitted)` when the app lacks the
  /// exact-alarm grant. Callers that swallow scheduling errors would then never
  /// register a reminder at all, so the patient would see no notification.
  Future<void> _scheduleLocal({
    required int id,
    required String title,
    required String body,
    required tz.TZDateTime when,
    required NotificationDetails details,
    required String payload,
    DateTimeComponents? matchDateTimeComponents,
  }) async {
    final preferred = await _canScheduleExactAlarms()
        ? AndroidScheduleMode.exactAllowWhileIdle
        : AndroidScheduleMode.inexactAllowWhileIdle;

    Future<void> scheduleWith(AndroidScheduleMode mode) {
      return _notifications.zonedSchedule(
        id,
        title,
        body,
        when,
        details,
        androidScheduleMode: mode,
        matchDateTimeComponents: matchDateTimeComponents,
        uiLocalNotificationDateInterpretation:
            UILocalNotificationDateInterpretation.absoluteTime,
        payload: payload,
      );
    }

    try {
      await scheduleWith(preferred);
    } on PlatformException {
      // Some Android/OEM builds reject an exact alarm with a code other than
      // `exact_alarms_not_permitted` (or revoke the grant between the probe and
      // the call). Retry once with an inexact alarm so the reminder is still
      // registered; only a second failure is reported to the patient.
      if (preferred == AndroidScheduleMode.inexactAllowWhileIdle) rethrow;
      await scheduleWith(AndroidScheduleMode.inexactAllowWhileIdle);
    }
  }

  // Set sync service reference (called after SyncService is created)
  void setSyncService(SyncService syncService) {
    _syncService = syncService;
  }

  // Set repository reference (called after ScheduleRepository is created)
  void setRepository(ScheduleRepository repository) {
    _repository = repository;
  }

  /// Records today's medicine confirmation.
  ///
  /// The order is deliberate and local-first: the device record is written and
  /// committed *before* any network call or notification cleanup, so a missing
  /// connection (or a failure in the OS notification layer) can never make the
  /// patient believe their confirmation was lost. The returned [ConfirmOutcome]
  /// reflects the real sync state, so the UI never claims the server accepted a
  /// confirmation it did not.
  Future<ConfirmOutcome> confirmMedicine() async {
    final repository = _repository;
    final syncService = _syncService;

    final activeTreatment = repository?.getCurrentTreatment();
    if (activeTreatment == null) {
      // Still record the patient's action locally even before treatment data
      // is available; it will be reconciled after the next sync.
      await markTodayConfirmed();
      onLocalConfirmation?.call();
      return ConfirmOutcome.localOnly;
    }

    final adherenceDate = _getTodayJakarta();

    // Guard against a duplicate tap (the UI already hides the button once the
    // day is confirmed). Return early so we never create a second operation
    // with a different timestamp, which the backend would reject with 409.
    if (_confirmations.isConfirmedOn(
      adherenceDate,
      treatmentId: activeTreatment.id,
    )) {
      // Repair a confirmation that exists locally but was never queued (for
      // example, an install upgraded from a build whose queue adapter was
      // missing). The outcome still reflects the real queue state.
      await ensureTodayConfirmationQueued();
      onLocalConfirmation?.call();
      await _safeCleanup(
        () => _refreshHistoryCache(activeTreatment.id),
        'history cache',
      );
      switch (syncService?.adherenceSyncStateFor(
        activeTreatment.id,
        adherenceDate,
      )) {
        case AdherenceSyncState.pending:
          return ConfirmOutcome.pendingSync;
        case AdherenceSyncState.needsAttention:
          return ConfirmOutcome.needsAttention;
        case AdherenceSyncState.synced:
        case null:
          return ConfirmOutcome.alreadyConfirmed;
      }
    }

    // Use UTC for consistent timestamp handling across client/server.
    final nowUtc = DateTime.now().toUtc();

    // 1. Persist locally first. This is the source of truth for the Beranda
    //    status and must succeed regardless of connectivity or the OS.
    await _confirmations.markConfirmed(
      treatmentId: activeTreatment.id,
      window: _currentWindowStart(),
      atUtc: nowUtc,
    );

    // The local record is now durable. Refresh the UI immediately instead of
    // waiting for notification cleanup or the backend round trip below.
    onLocalConfirmation?.call();

    // Keep the history cache in step with the confirmation store so a later
    // screen read does not show "belum dikonfirmasi" for today.
    await _safeCleanup(
      () => _refreshHistoryCache(activeTreatment.id),
      'history cache',
    );

    // 2. Stop nagging: drop any pending snooze and rebuild the routine schedule
    //    from local data. The rebuilt schedule omits today's doses (already
    //    confirmed) while keeping every future day, so confirming early never
    //    deletes tomorrow's reminder. Best-effort only - the record is already
    //    saved, so a cleanup failure must never surface as "confirmation
    //    failed".
    //
    //    Cancel today's alarms by their deterministic IDs first: that works even
    //    when the plugin cannot enumerate pending notifications, which is the
    //    situation where the listing-based cleanup below would fail.
    await _safeCleanup(
      () => _cancelTodayDoseReminders(activeTreatment.id),
      'today reminders',
    );
    await _safeCleanup(
      () => _cancelSnoozeReminders(activeTreatment.id),
      'snooze reminder',
    );
    await _safeCleanup(refreshRoutineReminders, 'routine reminders');

    if (syncService == null) return ConfirmOutcome.localOnly;

    // 3. Queue the operation with a canonical millisecond ISO timestamp and try
    //    to sync. Determine the outcome from the real queue state rather than
    //    assuming success.
    final operation = AdherenceOperation(
      operationId: _generateUuid(),
      treatmentCourseId: activeTreatment.id,
      adherenceDate: adherenceDate,
      confirmedAt: isoMillisUtc(nowUtc),
      expectedTreatmentVersion: activeTreatment.version,
      createdAt: nowUtc,
    );
    // Persist the operation before returning so the confirmation survives an
    // app kill even if the network is unavailable; process it in the background
    // and let the queue status drive the UI.
    final queued = await syncService.queueAdherenceOperation(operation);
    if (!queued) {
      // The local record is safe, but nothing will ever be retried. Say so
      // instead of claiming the server has (or will) receive it.
      return ConfirmOutcome.localOnly;
    }
    syncService.processAdherenceQueueInBackground();

    switch (syncService.adherenceSyncStateFor(
      activeTreatment.id,
      adherenceDate,
    )) {
      case AdherenceSyncState.synced:
        return ConfirmOutcome.synced;
      case AdherenceSyncState.pending:
        return ConfirmOutcome.pendingSync;
      case AdherenceSyncState.needsAttention:
        return ConfirmOutcome.needsAttention;
    }
  }

  /// Runs a best-effort cleanup/notification step, swallowing and logging any
  /// failure so it never breaks the confirmation flow.
  Future<void> _safeCleanup(
    Future<void> Function() action,
    String label,
  ) async {
    try {
      await action();
    } catch (error) {
      debugPrint('Non-fatal $label cleanup failed: $error');
    }
  }

  // Generate a UUID v4 using cryptographically secure random
  String _generateUuid() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    // Set version (4) and variant (RFC 4122)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}';
  }

  // Cancel today's remaining dose reminders for a treatment after confirmation.
  // This is handled by [refreshRoutineReminders], which rebuilds the whole
  // routine schedule from local data: today's windows are omitted while future
  // windows stay scheduled. Cancelling by payload date was unreliable because
  // the date part of a repeating notification's payload goes stale.

  /// Rebuilds the routine dose/control schedule from the locally stored data.
  /// Snoozes are preserved by [rescheduleAll] and are removed separately when
  /// the patient confirms.
  Future<void> refreshRoutineReminders({bool force = false}) async {
    final repository = _repository;
    if (repository == null) return;
    final treatments = repository.getAllTreatments();
    if (treatments.isEmpty) return;

    final storedWindows = repository.getReminderWindows();
    final windows = storedWindows.isNotEmpty
        ? storedWindows
        : <ReminderWindow>[
            for (final window in defaultReminderWindows)
              ReminderWindow(start: window.start, end: window.end),
          ];

    await rescheduleAll(
      treatments: treatments,
      schedules: repository.getAllSchedules(),
      reminderWindows: windows,
      force: force,
    );
  }

  /// Cancels any pending one-off snooze reminder for [treatmentId]. Used both
  /// before scheduling a fresh snooze (no duplicates) and when the patient
  /// confirms (no stale "minum obat" nudge after they already took it).
  ///
  /// The deterministic ID is cancelled first so this works even when the plugin
  /// cannot enumerate pending notifications; listing is only a best-effort pass
  /// for snoozes left by older builds.
  Future<void> _cancelSnoozeReminders(String treatmentId) async {
    try {
      await _notifications
          .cancel(snoozeNotificationId(treatmentId))
          .timeout(const Duration(seconds: 1));
    } catch (error) {
      debugPrint('Could not cancel the snooze by id: $error');
    }
    try {
      final pending = await _notifications
          .pendingNotificationRequests()
          .timeout(const Duration(seconds: 1));
      for (final n in pending) {
        final payload = n.payload;
        if (payload == null) continue;
        if (payload.contains('"type":"dose_reminder"') &&
            payload.contains('"window":"snooze"') &&
            payload.contains('"treatmentId":"$treatmentId"')) {
          await _notifications.cancel(n.id);
        }
      }
    } catch (error) {
      // Listing can fail on some devices; the deterministic cancel above is the
      // primary mechanism, so this must not abort confirmation or scheduling.
      debugPrint('Could not enumerate pending snoozes: $error');
    }
    _notificationIds.removeWhere(
      (key, _) => key.startsWith('snooze:$treatmentId:'),
    );
  }

  /// Cancels every routine reminder that belongs to today's WIB date.
  ///
  /// Uses the same deterministic IDs as scheduling, so it does not need to read
  /// the plugin's pending-notification cache. This is what guarantees that a
  /// confirmation stops today's reminders even when that cache cannot be read.
  Future<void> _cancelTodayDoseReminders(String treatmentId) async {
    final repository = _repository;
    if (repository == null) return;

    final now = tz.TZDateTime.now(tz.local);
    final startOfDay = tz.TZDateTime(tz.local, now.year, now.month, now.day);
    final storedWindows = repository.getReminderWindows();
    // Use exactly the windows the scheduler uses when no officer configuration
    // is stored; returning early here would leave today's default alarms alive.
    final windows = storedWindows.isNotEmpty
        ? storedWindows.map((window) => window.start).toList()
        : [for (final window in defaultReminderWindows) window.start];

    final plan = buildDoseReminderPlan(
      now: startOfDay,
      windows: windows,
      horizonDays: 0,
      skipToday: false,
      endDate: now.add(const Duration(days: 1)),
      followUpHorizonDays: _followUpHorizonDays,
      followUpInterval: _followUpInterval,
      followUpLastTime: _followUpLastTime,
    );

    final ids = <int>{
      for (final item in plan)
        doseNotificationId(
          treatmentId: treatmentId,
          date: item.date,
          window: item.window,
        ),
      snoozeNotificationId(treatmentId),
    };
    for (final id in ids) {
      try {
        await _notifications.cancel(id);
      } catch (error) {
        debugPrint('Could not cancel today reminder $id: $error');
      }
    }
  }

  /// Test seam for the deterministic cancellation path. Production callers use
  /// [confirmMedicine], which invokes the same method.
  @visibleForTesting
  Future<void> cancelTodayDoseReminders(String treatmentId) =>
      _cancelTodayDoseReminders(treatmentId);

  Future<void> _createNotificationChannels() async {
    final android = _androidPlugin;
    if (android == null) return;

    // High importance is what makes Android show a heads-up banner (Android 8+
    // channel importance, not the per-notification priority, controls it). The
    // dose channel also carries the bundled 15 second sound; the control channel
    // keeps the system default.
    await android.createNotificationChannel(doseNotificationChannel);
    await android.createNotificationChannel(controlNotificationChannel);
  }

  void _onNotificationTap(NotificationResponse response) {
    // Forward to the app so it can navigate to the relevant screen.
    onNotificationTap?.call(response.payload);
  }

  // Generate consistent notification ID from key
  int _getNotificationId(String key) {
    return key.hashCode & 0x7FFFFFFF;
  }

  // Get today's date in Jakarta timezone as YYYY-MM-DD string
  String _getTodayJakarta() => _confirmations.todayWib();

  /// Today's date in Asia/Jakarta as `YYYY-MM-DD` (public for the UI shell).
  String todayWib() => _confirmations.todayWib();

  /// The reminder window (`HH:mm`) that is currently in effect, if known. Used
  /// to record which dose slot a confirmation belongs to.
  String? _currentWindowStart() {
    final repository = _repository;
    if (repository == null) return null;
    final windows = repository.getReminderWindows().toList()
      ..sort((a, b) => a.start.compareTo(b.start));
    if (windows.isEmpty) return null;
    final now = tz.TZDateTime.now(tz.local);
    final nowMinutes = now.hour * 60 + now.minute;
    String? current;
    for (final w in windows) {
      final parts = w.start.split(':');
      if (parts.length < 2) continue;
      final hour = int.tryParse(parts[0]);
      final minute = int.tryParse(parts[1]);
      if (hour == null || minute == null) continue;
      if (hour * 60 + minute <= nowMinutes) {
        current = w.start;
      }
    }
    return current ?? windows.first.start;
  }

  /// Marks today (WIB) as confirmed for the active treatment. Kept for callers
  /// that do not resolve the treatment themselves (e.g. legacy code, tests).
  Future<void> markTodayConfirmed() async {
    await _confirmations.markConfirmed(treatmentId: _activeTreatmentId());
  }

  /// Queues today's locally saved confirmation if it is not on the server yet.
  ///
  /// This repairs confirmations stored by builds that could not write to the
  /// adherence queue, and it is safe to call repeatedly: it does nothing when
  /// there is no local record or an operation for today is already queued. The
  /// sync caller must only invoke it when the backend still reports today as
  /// unconfirmed, so an acknowledged confirmation is never sent again.
  Future<bool> ensureTodayConfirmationQueued() async {
    final syncService = _syncService;
    final repository = _repository;
    if (syncService == null || repository == null) return false;

    final active = repository.getCurrentTreatment();
    if (active == null) return false;

    final today = _getTodayJakarta();
    final record = _confirmations.recordOn(today, treatmentId: active.id);
    if (record == null) return false;

    // Guard the WIB-midnight race: the day key may have rolled over between
    // the timestamp and the local write. Sending that timestamp for the new
    // day would be rejected by the backend on every retry.
    final confirmedAtJakarta = IndoDate.parseIsoJakarta(record.confirmedAtUtc);
    if (confirmedAtJakarta == null) return false;
    final confirmedAt = DateTime.tryParse(record.confirmedAtUtc);
    if (confirmedAt == null) return false;
    final confirmedDate =
        '${confirmedAtJakarta.year}-'
        '${confirmedAtJakarta.month.toString().padLeft(2, '0')}-'
        '${confirmedAtJakarta.day.toString().padLeft(2, '0')}';
    if (confirmedDate != today) return false;

    if (syncService.hasQueuedOperationFor(active.id, today)) return true;

    final queued = await syncService.queueAdherenceOperation(
      AdherenceOperation(
        operationId: _generateUuid(),
        treatmentCourseId: active.id,
        adherenceDate: today,
        confirmedAt: isoMillisUtc(confirmedAt),
        expectedTreatmentVersion: active.version,
        createdAt: DateTime.now().toUtc(),
      ),
    );
    if (queued) syncService.processAdherenceQueueInBackground();
    return queued;
  }

  String _activeTreatmentId() => _repository?.getCurrentTreatment()?.id ?? '';

  /// Whether today's (WIB) dose is confirmed, optionally for one treatment.
  bool isTodayConfirmed([String? treatmentId]) =>
      _confirmations.isTodayConfirmed(treatmentId: treatmentId);

  /// Local time (Jakarta) at which today's dose was confirmed, if any.
  DateTime? getTodayConfirmedAt([String? treatmentId]) =>
      _confirmations.getTodayConfirmedAt(treatmentId: treatmentId);

  /// Overlays today's local confirmation on [history].
  ///
  /// Screens use this so an offline confirmation is immediately visible and
  /// consistent with Beranda, even when the cached/server history still says
  /// the day is unconfirmed.
  AdherenceHistory? historyWithToday(
    AdherenceHistory? history, {
    String? treatmentId,
  }) {
    return mergeLocalConfirmation(
      history: history,
      treatmentCourseId: treatmentId ?? history?.treatmentCourseId,
      todayWib: todayWib(),
      confirmed: isTodayConfirmed(treatmentId),
      confirmedAt: getTodayConfirmedAt(treatmentId),
    );
  }

  /// Best-effort cache update after a local confirmation. The confirmation
  /// store remains the source of truth; this only keeps the existing history
  /// cache from lagging behind.
  Future<void> _refreshHistoryCache(String treatmentId) async {
    final repository = _repository;
    if (repository == null) return;
    final merged = historyWithToday(
      repository.getAdherenceHistory(treatmentId),
      treatmentId: treatmentId,
    );
    if (merged != null) {
      await repository.saveAdherenceHistory(treatmentId, merged);
    }
  }

  /// Re-reads the persisted confirmation state. Reads already hit Hive on every
  /// call, so this is a no-op kept for callers/tests that used the old API.
  Future<void> refreshTodayConfirmation() async {}

  /// No longer clears the day's record; confirmations are keyed by WIB date and
  /// preserved as history. Kept as a no-op for backward compatibility.
  Future<void> clearConfirmationIfNeeded() async {}

  /// If the backend reports today's (WIB) adherence as taken but this device
  /// has no record for today, adopt it so the button matches the server.
  /// Only ever touches today's date, never a previous day.
  Future<void> reconcileTodayFromAdherence(
    String treatmentId,
    AdherenceHistory history,
  ) => _confirmations.reconcileTodayFromAdherence(treatmentId, history);

  // Schedule dose reminders for a treatment using reminderWindows from backend.
  //
  // Medicine reminders do not depend on the control schedule (it is not used
  // here); the parameter is kept optional for backwards compatibility. A
  // treatment with a reminder time must still remind even when it has no
  // control visit scheduled yet.
  /// Schedules one-off dose reminders for every window over the rolling
  /// [_reminderHorizonDays] horizon.
  ///
  /// Earlier versions used `matchDateTimeComponents: time` (a daily repeat), but
  /// the plugin derives the next fire time from the *current* day and ignores
  /// the date part. That made it impossible to skip today's reminder after an
  /// early confirmation without also deleting every future day, and it left the
  /// payload date stale. One-off alarms over a refreshed horizon avoid both
  /// problems and keep the exact-alarm fallback working per reminder.
  ///
  /// [desiredNotificationIds], when supplied, receives every ID that should
  /// stay scheduled; [rescheduleAll] uses it to cancel only stale reminders.
  Future<void> scheduleDoseReminders({
    required TreatmentCourse treatment,
    required ControlSchedule? schedule,
    required List<ReminderWindow> reminderWindows,
    Set<int>? desiredNotificationIds,
    bool force = false,
  }) async {
    if (!treatment.isActive || !treatment.remindersEnabled) return;

    final now = tz.TZDateTime.now(tz.local);
    final endDate =
        treatment.completedAt ?? DateTime.now().add(const Duration(days: 365));
    // Listing is only an optimization to avoid re-registering identical IDs.
    // The IDs are deterministic, so re-scheduling simply overwrites the same
    // alarm. A failure to list must never prevent reminders from being set.
    var pendingIds = <int>{};
    try {
      pendingIds = (await _notifications.pendingNotificationRequests())
          .map((n) => n.id)
          .toSet();
    } catch (error) {
      debugPrint('Could not read pending reminders before scheduling: $error');
    }

    final plan = buildDoseReminderPlan(
      now: now,
      windows: reminderWindows.map((window) => window.start).toList(),
      horizonDays: _reminderHorizonDays,
      // Today's doses are skipped once the patient has confirmed; future days
      // must still be scheduled.
      skipToday: isTodayConfirmed(treatment.id),
      endDate: endDate,
      followUpHorizonDays: _followUpHorizonDays,
      followUpInterval: _followUpInterval,
      followUpLastTime: _followUpLastTime,
    );

    for (final item in plan) {
      final notificationId = doseNotificationId(
        treatmentId: treatment.id,
        date: item.date,
        window: item.window,
      );

      desiredNotificationIds?.add(notificationId);
      if (!force && pendingIds.contains(notificationId)) continue;

      try {
        await _scheduleDoseReminder(
          treatmentId: treatment.id,
          dateKey: item.date,
          window: item.window,
          scheduledTime: item.when,
          force: force,
        );
      } catch (error) {
        // A platform exception can still leave the alarm registered (for
        // example, a transient channel error after AlarmManager accepted it).
        // A positive pending-list hit is authoritative; only count a failure
        // when the reminder is genuinely absent so the profile sheet does not
        // keep showing a stale "belum bisa dijadwalkan" warning after a retry.
        var registered = false;
        try {
          final pending = await _notifications
              .pendingNotificationRequests()
              .timeout(const Duration(seconds: 1));
          registered = pending.any((request) => request.id == notificationId);
        } catch (_) {
          // The diagnostic list itself is best effort; keep the real failure.
        }
        if (!registered) {
          // Keep registering the remaining alarms: one rejected date must not
          // leave the following days without reminders.
          _lastSchedulingFailureCount++;
          debugPrint('Failed to schedule ${item.date} ${item.window}: $error');
        }
      }
    }
  }

  Future<void> _scheduleDoseReminder({
    required String treatmentId,
    required String dateKey,
    required String window,
    required tz.TZDateTime scheduledTime,
    bool force = false,
  }) async {
    final key = 'dose:$_schedulingVersion:$treatmentId:$dateKey:$window';
    final notificationId = doseNotificationId(
      treatmentId: treatmentId,
      date: dateKey,
      window: window,
    );

    // A forced reschedule reuses the same deterministic ID rather than
    // cancelling first, so a failed call leaves the previous alarm intact.
    // Android's AlarmManager replaces the alarm under that PendingIntent.
    await _scheduleLocal(
      id: notificationId,
      title: 'Pengingat minum obat',
      body:
          'Konfirmasi minum obat hari ini belum tercatat. '
          'Buka aplikasi Dinar-TB untuk konfirmasi.',
      when: scheduledTime,
      details: doseNotificationDetails,
      payload:
          '{"type":"dose_reminder","treatmentId":"$treatmentId","date":"$dateKey","window":"$window"}',
    );

    _notificationIds[key] = notificationId;
  }

  /// Whether a snooze taken right now would land on the next WIB day. The UI
  /// uses this to explain why a late-night snooze is not scheduled.
  bool snoozeWouldCrossMidnightNow({
    Duration delay = const Duration(minutes: 30),
  }) => snoozeWouldCrossWibMidnight(
    now: tz.TZDateTime.now(tz.local),
    delay: delay,
  );

  /// Schedules a one-off dose reminder [delay] from now (the "ingatkan 30 menit
  /// lagi" action on Beranda). Does not recur; a later full reschedule replaces
  /// the recurring reminders but leaves this single fire untouched.
  Future<void> scheduleSnoozeReminder({
    required String treatmentId,
    Duration delay = const Duration(minutes: 30),
  }) async {
    SnoozeDiagnostics.reset();
    // Drop any earlier snooze for this treatment first so repeated taps never
    // stack multiple reminders or double-fire.
    await _cancelSnoozeReminders(treatmentId);

    // Never let a late-evening snooze fire on the next WIB day.
    if (snoozeWouldCrossWibMidnight(
      now: tz.TZDateTime.now(tz.local),
      delay: delay,
    )) {
      return;
    }

    final plan = buildSnoozePlan(
      now: tz.TZDateTime.now(tz.local),
      treatmentId: treatmentId,
      delay: delay,
    );

    await _scheduleLocal(
      id: plan.id,
      title: 'Pengingat minum obat',
      body:
          'Konfirmasi minum obat hari ini belum tercatat. '
          'Buka aplikasi Dinar-TB untuk konfirmasi.',
      when: plan.when,
      details: doseNotificationDetails,
      payload: plan.payload,
    );

    // A successful zonedSchedule is authoritative. The pending-notification
    // cache can lag or be empty even though Android accepted the alarm; using it
    // as a failure gate produced false "gagal dijadwalkan" messages.
    try {
      final pending = await _notifications
          .pendingNotificationRequests()
          .timeout(const Duration(seconds: 1));
      if (!pending.any((request) => request.id == plan.id)) {
        SnoozeDiagnostics.recordWarning(
          'foreground-pending-cache',
          StateError('id ${plan.id} not listed immediately after schedule'),
        );
      }
    } catch (error) {
      SnoozeDiagnostics.recordWarning('foreground-pending-read', error);
    }

    _notificationIds['snooze:$treatmentId:${plan.when.millisecondsSinceEpoch}'] =
        plan.id;
  }

  // Schedule control reminders (H-1 at 08:00 and H at 07:00)
  Future<void> scheduleControlReminders({
    required TreatmentCourse treatment,
    required ControlSchedule schedule,
    Set<int>? desiredNotificationIds,
    bool force = false,
  }) async {
    if (!treatment.isActive) return;

    final scheduledDate = DateTime.parse(schedule.scheduledDate);
    final now = tz.TZDateTime.now(tz.local);

    // H-1 reminder at 08:00
    final hMinus1 = tz.TZDateTime(
      tz.local,
      scheduledDate.year,
      scheduledDate.month,
      scheduledDate.day - 1,
      8,
      0,
    );
    if (hMinus1.isAfter(now)) {
      await _scheduleControlReminder(
        treatmentId: treatment.id,
        scheduleId: schedule.treatmentCourseId,
        scheduledDate: schedule.scheduledDate,
        trigger: 'H-1',
        scheduledTime: hMinus1,
        desiredNotificationIds: desiredNotificationIds,
        force: force,
      );
    }

    // H reminder at 07:00
    final hDay = tz.TZDateTime(
      tz.local,
      scheduledDate.year,
      scheduledDate.month,
      scheduledDate.day,
      7,
      0,
    );
    if (hDay.isAfter(now)) {
      await _scheduleControlReminder(
        treatmentId: treatment.id,
        scheduleId: schedule.treatmentCourseId,
        scheduledDate: schedule.scheduledDate,
        trigger: 'HARI_H',
        scheduledTime: hDay,
        desiredNotificationIds: desiredNotificationIds,
        force: force,
      );
    }
  }

  Future<void> _scheduleControlReminder({
    required String treatmentId,
    required String scheduleId,
    required String scheduledDate,
    required String trigger,
    required tz.TZDateTime scheduledTime,
    Set<int>? desiredNotificationIds,
    bool force = false,
  }) async {
    // Key includes scheduledDate so changes to date create new key
    final key =
        'control:$_schedulingVersion:$scheduleId:$scheduledDate:$trigger';
    final notificationId = _getNotificationId(key);
    desiredNotificationIds?.add(notificationId);

    if (!force && await _isScheduled(notificationId)) return;
    // With force, the same deterministic ID is re-registered below. Keeping the
    // old alarm until the replacement succeeds avoids a gap if it fails.

    String title;
    String body;

    if (trigger == 'H-1') {
      title = 'Kontrol Besok';
      body =
          'Jadwal kontrol Anda besok di Puskesmas. Siapkan kartu berobat dan obat yang tersisa.';
    } else {
      title = 'Kontrol Hari Ini';
      body = 'Jadwal kontrol Anda hari ini. Jangan lupa membawa kartu berobat.';
    }

    await _scheduleLocal(
      id: notificationId,
      title: title,
      body: body,
      when: scheduledTime,
      details: controlNotificationDetails,
      payload:
          '{"type":"control_reminder","treatmentId":"$treatmentId","scheduleId":"$scheduleId","trigger":"$trigger","scheduledDate":"$scheduledDate"}',
    );

    _notificationIds[key] = notificationId;
  }

  Future<bool> _isScheduled(int notificationId) async {
    // The pending list is an optimisation, not the source of truth. Some
    // devices intermittently fail or hang while listing alarms; treating that
    // as "already scheduled" would skip the control reminder entirely. On an
    // unreadable cache, attempt the deterministic schedule instead.
    try {
      final pending = await _notifications
          .pendingNotificationRequests()
          .timeout(const Duration(seconds: 1));
      return pending.any((n) => n.id == notificationId);
    } catch (error) {
      debugPrint('Could not read pending control reminder: $error');
      return false;
    }
  }

  // Cancel specific notification
  Future<void> cancel(String key) async {
    final notificationId = _getNotificationId(key);
    await _notifications.cancel(notificationId);
    _notificationIds.remove(key);
  }

  // Cancel all notifications for a treatment (both dose and control)
  Future<void> cancelTreatmentNotifications(String treatmentId) async {
    final pending = await _notifications.pendingNotificationRequests();
    for (final n in pending) {
      if (n.payload?.contains('"treatmentId":"$treatmentId"') ?? false) {
        await _notifications.cancel(n.id);
      }
    }
    // Clean up local tracking
    _notificationIds.removeWhere(
      (key, _) => key.contains('treatmentId":"$treatmentId"'),
    );
  }

  // Cancel all notifications for a specific schedule (both H-1 and HARI_H)
  Future<void> cancelScheduleNotifications(
    String scheduleId,
    String scheduledDate,
  ) async {
    final pending = await _notifications.pendingNotificationRequests();
    for (final n in pending) {
      final payload = n.payload;
      if (payload != null &&
          payload.contains('"scheduleId":"$scheduleId"') &&
          payload.contains('"scheduledDate":"$scheduledDate"')) {
        await _notifications.cancel(n.id);
      }
    }
    // Clean up local tracking
    _notificationIds.removeWhere(
      (key, _) =>
          key.contains('scheduleId":"$scheduleId"') &&
          key.contains('scheduledDate":"$scheduledDate"'),
    );
  }

  // Cancel all dose reminders for a specific date (used when rescheduling)
  Future<void> cancelDoseRemindersForDate(
    String treatmentId,
    String date,
  ) async {
    final pending = await _notifications.pendingNotificationRequests();
    final datePrefix = date.split('T')[0];
    for (final n in pending) {
      final payload = n.payload;
      if (payload != null &&
          payload.contains('"treatmentId":"$treatmentId"') &&
          payload.contains('"date":"$datePrefix"')) {
        await _notifications.cancel(n.id);
      }
    }
  }

  // Cancel all notifications
  Future<void> cancelAll() async {
    await _notifications.cancelAll();
    _notificationIds.clear();
    await _saveScheduledAlarmIds(const <int>{});
  }

  /// Cancels routine dose/control reminders that are no longer part of the
  /// desired schedule (old dates, removed windows, completed treatments, or
  /// reminders left on the legacy v1 channel). One-off snoozes and test
  /// notifications are never touched. Working from the desired ID set avoids
  /// cancelling and recreating every alarm on every sync.
  Future<void> _cancelStaleRoutineReminders(Set<int> desiredIds) async {
    List<PendingNotificationRequest> pending;
    try {
      pending = await _notifications.pendingNotificationRequests();
    } catch (error) {
      // Reconciliation is best effort. New reminders were already registered
      // with deterministic IDs, so failing to enumerate the old ones must not
      // fail the whole reschedule (which would leave no future reminders at all).
      debugPrint('Could not enumerate reminders for cleanup: $error');
      return;
    }
    for (final n in pending) {
      final payload = n.payload;
      if (payload == null) continue;
      if (payload.contains('"window":"snooze"')) continue;
      final isRoutine =
          payload.contains('"type":"dose_reminder"') ||
          payload.contains('"type":"control_reminder"');
      if (!isRoutine) continue;
      if (desiredIds.contains(n.id)) continue;
      await _notifications.cancel(n.id);
    }
    _notificationIds.removeWhere((key, _) => !key.startsWith('snooze:'));
  }

  /// Removes the local medicine-confirmation cache. Called when a session ends
  /// (logout or server-invalidated session) so the next patient starts clean.
  /// Pending unsynced operations are owned by `SyncService` and are cleared
  /// separately, after the caller has warned the user.
  Future<void> clearLocalConfirmationState() async {
    await _confirmations.clearAll();
    await _legacyConfirmationBox?.clear();
  }

  Future<Set<int>> _loadScheduledAlarmIds() async {
    if (_scheduledAlarmIds != null) return Set<int>.of(_scheduledAlarmIds!);
    final stored = _setupBox?.get(_scheduledAlarmIdsKey);
    if (stored is List) {
      _scheduledAlarmIds = {
        for (final value in stored)
          if (value is int) value,
      };
    } else {
      _scheduledAlarmIds = <int>{};
    }
    return Set<int>.of(_scheduledAlarmIds!);
  }

  Future<void> _saveScheduledAlarmIds(Set<int> ids) async {
    _scheduledAlarmIds = Set<int>.of(ids);
    try {
      await _setupBox?.put(_scheduledAlarmIdsKey, ids.toList());
    } catch (error) {
      // The in-memory copy still protects this process; persistence is only a
      // cross-restart safety net.
      debugPrint('Could not persist the scheduled reminder ids: $error');
    }
  }

  // Reschedule all notifications from current local data
  Future<void> rescheduleAll({
    required List<TreatmentCourse> treatments,
    required List<ControlSchedule> schedules,
    required List<ReminderWindow> reminderWindows,
    bool force = false,
  }) async {
    // The last synced staff status wins: an archived patient must not get new
    // reminders from any caller (startup, sync, resume, or profile changes).
    if (_repository?.isPatientArchived ?? false) {
      _lastSchedulingFailureCount = 0;
      await cancelAll();
      await _saveScheduledAlarmIds(const <int>{});
      return;
    }

    final previousAlarmIds = await _loadScheduledAlarmIds();

    // Build the set of reminder IDs that should remain scheduled. Stale
    // routine reminders (older dates, removed windows, legacy channels) are
    // cancelled afterwards, while snoozes are deliberately preserved.
    final desiredIds = <int>{};
    _lastSchedulingFailureCount = 0;

    // A snooze is a one-off dose reminder that is intentionally preserved by
    // [_cancelStaleRoutineReminders]. It must still stop when its course is
    // completed or reminders are disabled, otherwise a stale "minum obat"
    // notification can fire after the patient finished treatment.
    for (final treatment in treatments) {
      if (treatment.isActive && treatment.remindersEnabled) continue;
      await _cancelSnoozeReminders(treatment.id);
    }

    for (final treatment in treatments) {
      if (!treatment.isActive || !treatment.remindersEnabled) continue;

      // Skip treatments without a local schedule instead of throwing: a single
      // missing schedule must not abort the whole reschedule.
      ControlSchedule? schedule;
      for (final candidate in schedules) {
        if (candidate.treatmentCourseId == treatment.id) {
          schedule = candidate;
          break;
        }
      }
      try {
        // Medicine reminders always apply, even without a control schedule.
        await scheduleDoseReminders(
          treatment: treatment,
          schedule: schedule,
          reminderWindows: reminderWindows,
          desiredNotificationIds: desiredIds,
          force: force,
        );
        // Control reminders only make sense when there is a schedule to point
        // at; their absence must not stop the medicine reminders above.
        if (schedule != null) {
          await scheduleControlReminders(
            treatment: treatment,
            schedule: schedule,
            desiredNotificationIds: desiredIds,
            force: force,
          );
        }
      } catch (error) {
        // Keep scheduling the remaining treatments; a single treatment must not
        // abort the whole reschedule.
        _lastSchedulingFailureCount++;
        debugPrint(
          'Failed to schedule reminders for treatment ${treatment.id}: $error',
        );
        continue;
      }
    }

    await _cancelStaleRoutineReminders(desiredIds);

    // Deterministic cleanup for the previous run. This is the path that stops
    // an alarm scheduled at the old officer-configured time (06:00) when the
    // pending-notification cache cannot be enumerated, and it also clears every
    // remaining routine alarm after a treatment is completed.
    for (final id in previousAlarmIds.difference(desiredIds)) {
      try {
        await _notifications.cancel(id);
      } catch (error) {
        debugPrint('Could not cancel stale reminder $id: $error');
      }
    }
    await _saveScheduledAlarmIds(desiredIds);

    if (kDebugMode) {
      try {
        debugPrint(
          'Dinar-TB: ${await pendingNotificationCount()} notification(s) '
          'registered with Android after reschedule.',
        );
      } catch (error) {
        debugPrint('Could not read the reminder count: $error');
      }
    }
  }

  // Request notification permission
  Future<bool> requestPermission() async {
    if (await _notifications
            .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin
            >()
            ?.areNotificationsEnabled() ??
        false) {
      return true;
    }

    final result = await _notifications
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.requestNotificationsPermission();

    return result ?? false;
  }

  /// Requests the runtime notification permission only.
  ///
  /// The exact-alarm entitlement is deliberately *not* requested here: on
  /// Android 12+ that call opens a system settings screen, and doing it on every
  /// launch is intrusive. Reminders still work through the inexact fallback in
  /// [_scheduleLocal]; the patient can grant exact alarms from
  /// "Pengaturan Notifikasi" in Profil when they want maximum punctuality.
  Future<({bool notifications, bool exactAlarms})>
  requestAllPermissions() async {
    final notifications = await requestPermission();
    final exactAlarms = await _canScheduleExactAlarms();

    if (!notifications) {
      debugPrint(
        'POST_NOTIFICATIONS not granted: medicine reminders cannot be shown.',
      );
    }
    if (!exactAlarms) {
      debugPrint(
        'Exact alarms not granted: reminders use the inexact fallback and may '
        'be delivered slightly late.',
      );
    }

    return (notifications: notifications, exactAlarms: exactAlarms);
  }

  /// Whether the one-time permission onboarding still needs to be shown.
  ///
  /// It is shown only once. The marker is written when the patient finishes or
  /// dismisses the sheet, so a later revocation is handled from Profil instead
  /// of reopening onboarding on every launch.
  Future<bool> shouldShowNotificationSetup() async {
    if (!Platform.isAndroid) return false;
    if (_setupBox?.get(_setupSeenKey, defaultValue: false) == true) {
      return false;
    }

    final notifications = await areNotificationsEnabled();
    final exactAlarms = await canScheduleExactAlarms();
    if (notifications && exactAlarms) {
      // Permissions were already complete before onboarding was ever shown.
      // Remember that so a later revocation does not reopen it.
      await markNotificationSetupSeen();
      return false;
    }
    return true;
  }

  /// Marks the one-time permission onboarding as completed.
  Future<void> markNotificationSetupSeen() async {
    await _setupBox?.put(_setupSeenKey, true);
  }

  /// Whether the OS currently lets this app post notifications. Authoritative
  /// on Android 13+ (POST_NOTIFICATIONS).
  Future<bool> areNotificationsEnabled() async {
    if (!Platform.isAndroid) return true;
    return await _androidPlugin?.areNotificationsEnabled() ?? false;
  }

  /// Public wrapper used by the Profil diagnostic sheet.
  Future<bool> canScheduleExactAlarms() => _canScheduleExactAlarms();

  /// Opens the Android "Alarm & pengingat" screen and reports the result.
  /// Only called from an explicit user action.
  Future<bool> requestExactAlarmPermission() => _requestExactAlarmPermission();

  /// Number of alarms currently registered with Android (not just in app
  /// state). Used by the Profil diagnostic sheet and debug logs.
  Future<int> pendingNotificationCount() async =>
      (await _notifications.pendingNotificationRequests()).length;

  /// The live configuration of the dose channel as stored by Android. This is
  /// the only reliable way to see whether the installed build's channel really
  /// has high importance and sound enabled (channel settings are immutable
  /// after creation).
  Future<AndroidNotificationChannel?> doseChannelStatus() async {
    final channels = await _androidPlugin?.getNotificationChannels();
    if (channels == null) return null;
    for (final channel in channels) {
      if (channel.id == _doseChannelId) return channel;
    }
    return null;
  }

  /// Human-readable view of the installed dose channel for the Profil sheet,
  /// without leaking plugin types into the UI layer.
  Future<({String name, bool highImportance, bool soundEnabled})?>
  doseChannelSummary() async {
    final channel = await doseChannelStatus();
    if (channel == null) return null;
    return (
      name: channel.name,
      highImportance: channel.importance.index >= Importance.high.index,
      soundEnabled: channel.playSound,
    );
  }

  /// Posts an immediate notification so the patient can verify that banners and
  /// sound work on their device and current settings.
  Future<void> showTestNotification() async {
    await _notifications.show(
      _testNotificationId,
      'Uji Notifikasi Dinar-TB',
      'Jika Anda melihat banner dan mendengar suara, notifikasi aktif.',
      doseNotificationDetails,
      payload: '{"type":"test_notification"}',
    );
  }

  /// Schedules a one-off test notification [delay] from now. This exercises the
  /// real scheduling path (including the exact-alarm fallback and reboot
  /// restoration), not just an instant `show`.
  Future<void> scheduleTestNotification({
    Duration delay = const Duration(minutes: 1),
  }) async {
    await _notifications.cancel(_testScheduledNotificationId);
    await _scheduleLocal(
      id: _testScheduledNotificationId,
      title: 'Uji Pengingat Terjadwal',
      body: 'Notifikasi terjadwal Dinar-TB berhasil muncul.',
      when: tz.TZDateTime.now(tz.local).add(delay),
      details: doseNotificationDetails,
      payload: '{"type":"test_notification"}',
    );

    // Verify that Android really registered the alarm before the caller can
    // report success. If the pending list itself cannot be read, the successful
    // zonedSchedule call remains the authoritative result.
    bool? registered;
    try {
      final pending = await _notifications.pendingNotificationRequests();
      registered = pending.any(
        (request) => request.id == _testScheduledNotificationId,
      );
    } catch (error) {
      debugPrint('Could not verify the scheduled test notification: $error');
    }
    if (registered == false) {
      await _notifications.cancel(_testScheduledNotificationId);
      throw StateError('Android did not register the scheduled test alarm.');
    }
  }

  Future<void> cancelTestNotifications() async {
    await _notifications.cancel(_testNotificationId);
    await _notifications.cancel(_testScheduledNotificationId);
  }
}
