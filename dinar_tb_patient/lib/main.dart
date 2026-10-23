import 'dart:async';

import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:dinar_tb_patient/theme/app_theme.dart';
import 'package:dinar_tb_patient/widgets/bottom_nav_bar.dart';
import 'package:dinar_tb_patient/widgets/notification_setup_sheet.dart';
import 'package:dinar_tb_patient/screens/activation_screen.dart';
import 'package:dinar_tb_patient/screens/beranda_screen.dart';
import 'package:dinar_tb_patient/screens/jadwal_screen.dart';
import 'package:dinar_tb_patient/screens/perkembangan_screen.dart';
import 'package:dinar_tb_patient/screens/profil_screen.dart';
import 'package:dinar_tb_patient/screens/riwayat_screen.dart';
import 'package:dinar_tb_patient/screens/notifications_screen.dart';
import 'package:dinar_tb_patient/repositories/schedule_repository.dart';
import 'package:dinar_tb_patient/services/activation_service.dart';
import 'package:dinar_tb_patient/services/api_client.dart';
import 'package:dinar_tb_patient/services/notification_service.dart';
import 'package:dinar_tb_patient/services/secure_store.dart';
import 'package:dinar_tb_patient/services/session_service.dart';
import 'package:dinar_tb_patient/services/sync_service.dart';
import 'package:dinar_tb_patient/services/fcm_service.dart';
import 'package:dinar_tb_patient/services/hive_setup.dart';
import 'package:dinar_tb_patient/services/reminder_maintenance.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Hive. Adapter registration is shared with the tests via
  // `hive_setup.dart` so a missing nested adapter cannot slip into a release.
  await Hive.initFlutter();
  registerHiveAdapters();

  // WorkManager survives reboots and periodically extends the local reminder
  // horizon. It uses the same stored data and notification IDs as the app.
  await initializeReminderMaintenance();

  // Initialize services
  final repository = ScheduleRepository();
  await repository.init();

  final apiClient = ApiClient();
  final activationService = ActivationService(FlutterSecureStore(), apiClient);
  // A 401 on a patient endpoint triggers a one-time, single-flight token refresh
  // instead of sending the patient back to the activation screen.
  apiClient.setTokenRefresher(activationService.refreshAccessToken);

  final notificationService = NotificationService();
  await notificationService.init();

  // Permission onboarding is shown from the shell with an explanation. Asking
  // on startup (and again from FCM) produced a bare system prompt before the
  // patient understood why it was needed.
  final syncService = SyncService(
    apiClient: apiClient,
    repository: repository,
    notificationService: notificationService,
    connectivity: Connectivity(),
  );
  // Link services before the first sync so its recovery pass can queue a
  // locally confirmed dose whose operation never reached the server.
  notificationService.setSyncService(syncService);
  notificationService.setRepository(repository);

  await syncService.init();

  final sessionService = SessionService(
    activationService: activationService,
    repository: repository,
    syncService: syncService,
    notificationService: notificationService,
  );

  // Initialize FCM (will silently fail if google-services.json not present)
  final fcmService = FcmService();
  await fcmService.init(syncService: syncService, apiClient: apiClient);

  runApp(
    DinarTbPatientApp(
      repository: repository,
      apiClient: apiClient,
      activationService: activationService,
      notificationService: notificationService,
      syncService: syncService,
      fcmService: fcmService,
      sessionService: sessionService,
    ),
  );
}

class DinarTbPatientApp extends StatelessWidget {
  final ScheduleRepository repository;
  final ApiClient apiClient;
  final ActivationService activationService;
  final NotificationService notificationService;
  final SyncService syncService;
  final FcmService fcmService;
  final SessionService sessionService;

  const DinarTbPatientApp({
    super.key,
    required this.repository,
    required this.apiClient,
    required this.activationService,
    required this.notificationService,
    required this.syncService,
    required this.fcmService,
    required this.sessionService,
  });

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Dinar-TB',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      home: StartupGate(
        repository: repository,
        apiClient: apiClient,
        activationService: activationService,
        notificationService: notificationService,
        syncService: syncService,
        fcmService: fcmService,
        sessionService: sessionService,
      ),
    );
  }
}

/// Decides whether to show the one-time activation screen or the patient app.
///
/// Activation is stored in secure storage, so a restart, a force-close, or a
/// network outage never clears it. When already activated we try to refresh the
/// access token (best effort) and then sync; both failures are non-fatal and the
/// app opens with whatever data is cached locally.
class StartupGate extends StatefulWidget {
  final ScheduleRepository repository;
  final ApiClient apiClient;
  final ActivationService activationService;
  final NotificationService notificationService;
  final SyncService syncService;
  final FcmService fcmService;
  final SessionService sessionService;

  const StartupGate({
    super.key,
    required this.repository,
    required this.apiClient,
    required this.activationService,
    required this.notificationService,
    required this.syncService,
    required this.fcmService,
    required this.sessionService,
  });

  @override
  State<StartupGate> createState() => _StartupGateState();
}

class _StartupGateState extends State<StartupGate> {
  bool? _activated;

  /// Shown on the activation screen when the previous session was ended by the
  /// server (deleted patient / revoked device).
  String? _sessionNotice;
  bool _endingSession = false;

  @override
  void initState() {
    super.initState();
    // A 401/404 during a background sync must end the session, not keep showing
    // stale cached data. Wire the callback before the first sync can run.
    widget.syncService.onSessionInvalid = _handleInvalidSession;
    _bootstrap();
  }

  @override
  void dispose() {
    widget.syncService.onSessionInvalid = null;
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final activated = await widget.activationService.isActivated();
    if (!activated) {
      if (mounted) setState(() => _activated = false);
      return;
    }

    SessionInvalidReason? invalidReason;
    var unsynced = 0;
    try {
      await widget.activationService.refreshAccessToken();
    } on ApiException catch (error) {
      if (error.isSessionInvalid) {
        invalidReason = error.isNotFound
            ? SessionInvalidReason.patientNotFound
            : SessionInvalidReason.unauthorized;
        unsynced = widget.sessionService.pendingSyncCount;
      }
      // Any other failure (no status code / server unreachable) is connectivity
      // trouble: keep the app usable with local data.
    } catch (_) {
      // Offline or transient failure: keep the app usable with local data.
    }

    if (invalidReason != null) {
      await widget.sessionService.endSession();
      if (!mounted) return;
      setState(() {
        _activated = false;
        _sessionNotice = _invalidSessionMessage(invalidReason!, unsynced);
      });
      return;
    }

    if (!mounted) return;
    setState(() => _activated = true);
    unawaited(widget.syncService.forceSync());
  }

  void _onActivated() {
    unawaited(_startNewSession());
  }

  /// Clears any data that belonged to a previous account before the new
  /// patient's data is downloaded, so caches can never be mixed.
  Future<void> _startNewSession() async {
    await widget.sessionService.clearPatientData();
    if (!mounted) return;
    setState(() {
      _activated = true;
      _sessionNotice = null;
    });
    // Re-arm connectivity sync and FCM for the freshly activated device.
    unawaited(widget.syncService.init());
    unawaited(
      widget.fcmService.init(
        syncService: widget.syncService,
        apiClient: widget.apiClient,
      ),
    );
  }

  Future<void> _handleLogout() async {
    if (!mounted || _endingSession) return;
    _endingSession = true;
    setState(() => _activated = null);
    try {
      await widget.sessionService.endSession();
    } finally {
      if (mounted) {
        setState(() {
          _activated = false;
          _sessionNotice = null;
          _endingSession = false;
        });
      }
    }
  }

  Future<void> _handleInvalidSession(SessionInvalidReason reason) async {
    if (!mounted || _activated != true || _endingSession) return;
    _endingSession = true;
    final unsynced = widget.sessionService.pendingSyncCount;
    setState(() => _activated = null);
    try {
      await widget.sessionService.endSession();
    } finally {
      if (mounted) {
        setState(() {
          _activated = false;
          _sessionNotice = _invalidSessionMessage(reason, unsynced);
          _endingSession = false;
        });
      }
    }
  }

  String _invalidSessionMessage(SessionInvalidReason reason, int unsynced) {
    final base = reason == SessionInvalidReason.patientNotFound
        ? 'Data pasien untuk sesi ini sudah tidak ditemukan di server. '
              'Sesi lama telah dihapus dari perangkat ini.'
        : 'Sesi Anda sudah tidak berlaku. '
              'Sesi lama telah dihapus dari perangkat ini.';
    final unsyncedNote = unsynced > 0
        ? '\n\n$unsynced konfirmasi obat yang belum terkirim tidak dapat '
              'diselamatkan karena sesi sudah tidak berlaku.'
        : '';
    return '$base$unsyncedNote\n\n'
        'Masukkan kode aktivasi baru dari petugas untuk melanjutkan.';
  }

  @override
  Widget build(BuildContext context) {
    if (_activated == null) {
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(color: AppTheme.primaryBlue),
        ),
      );
    }
    if (!_activated!) {
      return ActivationScreen(
        activationService: widget.activationService,
        onActivated: _onActivated,
        notice: _sessionNotice,
      );
    }
    return PatientShell(
      repository: widget.repository,
      apiClient: widget.apiClient,
      notificationService: widget.notificationService,
      syncService: widget.syncService,
      fcmService: widget.fcmService,
      onLogout: _handleLogout,
    );
  }
}

class PatientShell extends StatefulWidget {
  final ScheduleRepository repository;
  final ApiClient apiClient;
  final NotificationService notificationService;
  final SyncService syncService;
  final FcmService fcmService;
  final Future<void> Function() onLogout;

  const PatientShell({
    super.key,
    required this.repository,
    required this.apiClient,
    required this.notificationService,
    required this.syncService,
    required this.fcmService,
    required this.onLogout,
  });

  @override
  State<PatientShell> createState() => _PatientShellState();
}

class _PatientShellState extends State<PatientShell>
    with WidgetsBindingObserver {
  PatientTab _currentTab = PatientTab.beranda;

  /// The WIB calendar date the UI was last built for. When this changes (e.g.
  /// the app is left open across midnight) we rebuild so the confirm button
  /// resets for the new day.
  String _todayWib = '';
  Timer? _rolloverTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _todayWib = widget.notificationService.todayWib();
    // Poll for the WIB date rolling over while the app stays in the foreground.
    _rolloverTimer = Timer.periodic(
      const Duration(seconds: 20),
      (_) => _checkDateRollover(),
    );

    // Route notification taps to the relevant tab.
    widget.notificationService.onNotificationTap = _handleNotificationPayload;
    // Refresh as soon as the confirmation is durable locally, without waiting
    // for notification cleanup or the server round trip.
    widget.notificationService.onLocalConfirmation = () {
      if (mounted) setState(() {});
    };
    final initialPayload =
        widget.notificationService.initialNotificationPayload;
    if (initialPayload != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _handleNotificationPayload(initialPayload);
      });
    }

    // Explain permission before Android shows its system prompt. This runs at
    // most once; later changes are handled from Profil.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_maybeShowNotificationSetup());
    });
  }

  bool _notificationSetupShown = false;

  Future<void> _maybeShowNotificationSetup() async {
    if (_notificationSetupShown || !mounted) return;

    bool needed;
    try {
      needed = await widget.notificationService.shouldShowNotificationSetup();
    } catch (error) {
      debugPrint('Could not read notification setup state: $error');
      return;
    }
    if (!needed || !mounted || _notificationSetupShown) return;

    _notificationSetupShown = true;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => NotificationSetupSheet(
        notificationService: widget.notificationService,
      ),
    );
    try {
      await widget.notificationService.markNotificationSetupSeen();
    } catch (error) {
      debugPrint('Could not save notification setup state: $error');
    }
  }

  String _activeTreatmentId() =>
      widget.repository.getCurrentTreatment()?.id ?? '';

  void _checkDateRollover() {
    final now = widget.notificationService.todayWib();
    if (now != _todayWib && mounted) {
      setState(() => _todayWib = now);
    }
  }

  void _handleNotificationPayload(String? payload) {
    if (!mounted) return;
    final target = (payload != null && payload.contains('control_reminder'))
        ? PatientTab.jadwal
        : PatientTab.beranda;
    if (target != _currentTab) {
      setState(() => _currentTab = target);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Recompute for the current WIB date (midnight may have passed) and pull
      // fresh data.
      _checkDateRollover();
      if (mounted) setState(() {});
      unawaited(widget.syncService.forceSync());
    }
  }

  void _onTabSelected(PatientTab tab) {
    if (tab != _currentTab) {
      setState(() {
        _currentTab = tab;
      });
    }
  }

  void _onConfirmMedicine() async {
    ConfirmOutcome outcome;
    try {
      outcome = await widget.notificationService.confirmMedicine();
    } catch (_) {
      // Only a genuine local write failure should say the confirmation was not
      // saved. If the record is already on the device, report that instead of
      // contradicting the updated card.
      if (!mounted) return;
      final saved = widget.notificationService.isTodayConfirmed();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            saved
                ? 'Konfirmasi tersimpan di perangkat. Sinkronisasi akan '
                      'dicoba lagi saat online.'
                : 'Konfirmasi gagal disimpan. Silakan coba lagi.',
          ),
          backgroundColor: saved ? AppTheme.yellow : AppTheme.red,
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 4),
        ),
      );
      return;
    }

    if (!mounted) return;
    setState(() {});

    final (String message, Color color) = switch (outcome) {
      ConfirmOutcome.synced => (
        'Konfirmasi tersimpan dan tersinkron.',
        AppTheme.green,
      ),
      ConfirmOutcome.pendingSync => (
        'Konfirmasi tersimpan. Menunggu sinkronisasi.',
        AppTheme.primaryBlue,
      ),
      ConfirmOutcome.needsAttention => (
        'Konfirmasi tersimpan di perangkat dan akan dikirim ulang saat online.',
        AppTheme.yellow,
      ),
      ConfirmOutcome.localOnly => (
        'Konfirmasi tersimpan di perangkat.',
        AppTheme.primaryBlue,
      ),
      ConfirmOutcome.alreadyConfirmed => (
        'Kamu sudah mengonfirmasi minum obat hari ini.',
        AppTheme.green,
      ),
    };

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: color,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 3),
      ),
    );
  }

  void _onSnooze() async {
    final active = widget.repository.getCurrentTreatment();
    if (active != null && (!active.isActive || !active.remindersEnabled)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Pengobatan sudah selesai atau pengingat dinonaktifkan, jadi '
            'tidak ada pengingat yang perlu dijadwalkan.',
          ),
          backgroundColor: AppTheme.yellow,
          behavior: SnackBarBehavior.floating,
          duration: Duration(seconds: 4),
        ),
      );
      return;
    }

    if (widget.notificationService.snoozeWouldCrossMidnightNow()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Hari ini hampir berakhir, jadi pengingat tidak dijadwalkan '
            'agar tidak muncul setelah tengah malam.',
          ),
          backgroundColor: AppTheme.yellow,
          behavior: SnackBarBehavior.floating,
          duration: Duration(seconds: 4),
        ),
      );
      return;
    }

    // The permission probe only affects the wording of the success message.
    // Bound it so a hung platform channel can never block the snooze.
    final notificationsEnabled = await notificationsEnabledForSnooze(
      widget.notificationService.areNotificationsEnabled,
    );

    SnoozeDiagnostics.reset();
    try {
      // Even without cached treatment data the snooze reminder is still local
      // and useful, so schedule it instead of returning silently.
      await widget.notificationService
          .scheduleSnoozeReminder(treatmentId: active?.id ?? '')
          .timeout(const Duration(seconds: 10));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            notificationsEnabled
                ? 'Pengingat dijadwalkan 30 menit lagi'
                : 'Pengingat dijadwalkan, tetapi izin notifikasi sedang mati. '
                      'Aktifkan izin notifikasi agar popup muncul.',
          ),
          backgroundColor: notificationsEnabled
              ? AppTheme.primaryBlue
              : AppTheme.yellow,
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 4),
        ),
      );
    } catch (error) {
      SnoozeDiagnostics.recordFailure('foreground-schedule', error);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Pengingat gagal dijadwalkan: '
            '${snoozeFailurePatientMessage(error)}. Coba lagi.',
          ),
          backgroundColor: AppTheme.red,
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 5),
        ),
      );
    }
  }

  void _openNotifications() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) =>
            NotificationsScreen(syncService: widget.syncService),
      ),
    );
  }

  @override
  void dispose() {
    _rolloverTimer?.cancel();
    widget.notificationService.onLocalConfirmation = null;
    WidgetsBinding.instance.removeObserver(this);
    widget.syncService.dispose();
    widget.fcmService.dispose();
    super.dispose();
  }

  Widget _buildCurrentScreen() {
    switch (_currentTab) {
      case PatientTab.beranda:
        final activeTreatmentId = _activeTreatmentId();
        return BerandaScreen(
          repository: widget.repository,
          notificationService: widget.notificationService,
          syncService: widget.syncService,
          confirmed: widget.notificationService.isTodayConfirmed(
            activeTreatmentId,
          ),
          adherenceSyncState: widget.syncService.adherenceSyncStateFor(
            activeTreatmentId,
            widget.notificationService.todayWib(),
          ),
          onConfirm: _onConfirmMedicine,
          onSnooze: _onSnooze,
          onNotifications: _openNotifications,
          onHistory: () {
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (context) => RiwayatScreen(
                  repository: widget.repository,
                  apiClient: widget.apiClient,
                  syncService: widget.syncService,
                  notificationService: widget.notificationService,
                ),
              ),
            );
          },
          onNavigate: _onTabSelected,
        );
      case PatientTab.jadwal:
        return JadwalScreen(
          repository: widget.repository,
          syncService: widget.syncService,
        );
      case PatientTab.perkembangan:
        return PerkembanganScreen(
          repository: widget.repository,
          syncService: widget.syncService,
          notificationService: widget.notificationService,
        );
      case PatientTab.profil:
        return ProfilScreen(
          repository: widget.repository,
          notificationService: widget.notificationService,
          syncService: widget.syncService,
          onLogout: widget.onLogout,
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.lightTheme.scaffoldBackgroundColor,
      body: SafeArea(
        bottom: false,
        child: AnimatedBuilder(
          animation: widget.syncService.syncStatus,
          builder: (context, _) {
            return Stack(
              children: [
                _buildCurrentScreen(),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: PatientBottomNavBar(
                    currentTab: _currentTab,
                    onTabSelected: _onTabSelected,
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
