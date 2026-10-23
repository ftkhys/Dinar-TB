import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:dinar_tb_patient/services/api_client.dart';
import 'package:dinar_tb_patient/services/sync_service.dart';

/// Handles Firebase Cloud Messaging integration for Dinar-TB Patient app.
///
/// Responsibilities:
/// - Initialize Firebase Core and Firebase Messaging
/// - Register and refresh FCM token with backend
/// - Treat a `schedule_changed` push as a *signal to sync*, not as data
/// - Trigger incremental sync so the backend (the source of truth) updates the
///   local schedule cache and the notification schedule
class FcmService {
  FcmService._internal();
  static final FcmService _instance = FcmService._internal();
  factory FcmService() => _instance;

  bool _firebaseReady = false;
  bool _listening = false;
  bool _backgroundRegistered = false;
  String? _fcmToken;
  StreamSubscription<String>? _tokenSubscription;
  StreamSubscription<RemoteMessage>? _messageSubscription;

  ApiClient? _apiClient;
  late SyncService _syncService;

  Future<void> init({
    required SyncService syncService,
    required ApiClient apiClient,
  }) async {
    _syncService = syncService;
    _apiClient = apiClient;

    try {
      final messaging = FirebaseMessaging.instance;

      if (!_firebaseReady) {
        await Firebase.initializeApp();

        // Runtime notification permission is owned by the in-app onboarding
        // and Profil sheets. Asking here as well produced a duplicate prompt.

        // Background delivery is best-effort and NOT relied upon for
        // correctness: the handler is a lightweight placeholder, and any missed
        // schedule change is reconciled by the next foreground sync. It is
        // registered once per process.
        if (!_backgroundRegistered) {
          FirebaseMessaging.onBackgroundMessage(_handleBackgroundMessage);
          _backgroundRegistered = true;
        }

        // Handle notification taps when app is terminated/background
        FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageOpenedApp);

        // Check if app was opened from terminated state via notification
        final initialMessage = await messaging.getInitialMessage();
        if (initialMessage != null) {
          _handleMessageOpenedApp(initialMessage);
        }

        _firebaseReady = true;
      }

      // A logout/re-activation disposes these subscriptions, so re-arm them for
      // the new device instead of leaving push handling disabled.
      if (_listening) return;

      // Get initial token
      _fcmToken = await messaging.getToken();
      if (_fcmToken != null) {
        await _registerTokenWithBackend(_fcmToken!);
      }

      // Listen for token refresh
      _tokenSubscription = messaging.onTokenRefresh.listen(_onTokenRefresh);

      // Handle foreground messages
      _messageSubscription = FirebaseMessaging.onMessage.listen(
        _handleForegroundMessage,
      );

      _listening = true;
    } catch (e) {
      // Silently handle initialization errors (e.g., no google-services.json)
      // Push notifications will be disabled but local notifications still work
    }
  }

  Future<void> _registerTokenWithBackend(String token) async {
    try {
      await _apiClient?.registerFcmToken(token);
    } catch (e) {
      // Silently handle registration failure
    }
  }

  Future<void> _onTokenRefresh(String newToken) async {
    _fcmToken = newToken;
    await _registerTokenWithBackend(newToken);
  }

  Future<void> _handleForegroundMessage(RemoteMessage message) async {
    if (message.data['type'] != 'schedule_changed') return;
    // Do not write the (unvalidated) FCM payload into the cache: a stale or
    // out-of-order push could overwrite a newer schedule. Instead, treat the
    // push as a signal and pull the authoritative state from the backend, which
    // persists the schedule and reschedules the local notifications.
    await _syncService.incrementalSync();
  }

  // This must be a top-level function or static method for background handling.
  // It intentionally does no work: correctness never depends on it. A schedule
  // change that arrives while the app is terminated is picked up by the next
  // foreground/cold-start sync.
  static Future<void> _handleBackgroundMessage(RemoteMessage message) async {}

  Future<void> _handleMessageOpenedApp(RemoteMessage message) async {
    final data = message.data;
    if (data['type'] == 'schedule_changed') {
      await _syncService.incrementalSync();
    }
  }

  void dispose() {
    _tokenSubscription?.cancel();
    _tokenSubscription = null;
    _messageSubscription?.cancel();
    _messageSubscription = null;
    _listening = false;
  }
}
