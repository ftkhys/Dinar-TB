import 'package:flutter/material.dart';

import 'package:dinar_tb_patient/theme/app_theme.dart';
import 'package:dinar_tb_patient/services/notification_service.dart';

/// One-time, plain-language permission onboarding.
///
/// The patient sees this once before the app asks for notification access.
/// Android's exact-alarm screen is a system settings page, so it is only opened
/// from an explicit button and the status is re-read whenever the app resumes.
class NotificationSetupSheet extends StatefulWidget {
  final NotificationService notificationService;

  const NotificationSetupSheet({super.key, required this.notificationService});

  @override
  State<NotificationSetupSheet> createState() => _NotificationSetupSheetState();
}

class _NotificationSetupSheetState extends State<NotificationSetupSheet>
    with WidgetsBindingObserver {
  bool _loading = true;
  bool _busy = false;
  bool? _notificationsEnabled;
  bool? _exactAlarms;
  String? _notificationsError;
  String? _exactAlarmsError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && !_busy) {
      _refresh();
    }
  }

  Future<void> _refresh() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _notificationsError = null;
      _exactAlarmsError = null;
    });

    bool? notifications;
    String? notificationsError;
    try {
      notifications = await widget.notificationService
          .areNotificationsEnabled()
          .timeout(const Duration(seconds: 6));
    } catch (error) {
      debugPrint('Failed to read notification permission: $error');
      notificationsError = 'Status izin belum dapat diperiksa';
    }

    bool? exactAlarms;
    String? exactAlarmsError;
    try {
      exactAlarms = await widget.notificationService
          .canScheduleExactAlarms()
          .timeout(const Duration(seconds: 6));
    } catch (error) {
      debugPrint('Failed to read exact-alarm permission: $error');
      exactAlarmsError = 'Status izin belum dapat diperiksa';
    }

    if (!mounted) return;
    setState(() {
      _notificationsEnabled = notifications;
      _exactAlarms = exactAlarms;
      _notificationsError = notificationsError;
      _exactAlarmsError = exactAlarmsError;
      _loading = false;
    });
  }

  void _showSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 4),
      ),
    );
  }

  Future<void> _requestNotifications() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final granted = await widget.notificationService.requestPermission();
      await _refresh();
      if (!granted) {
        _showSnack(
          'Izin belum aktif. Anda bisa mengaktifkannya dari Pengaturan '
          'Android > Aplikasi > Dinar-TB > Notifikasi.',
        );
      }
    } catch (error) {
      debugPrint('Failed to request notification permission: $error');
      _showSnack('Izin notifikasi belum dapat diminta. Coba lagi.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _requestExactAlarms() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final granted = await widget.notificationService
          .requestExactAlarmPermission();
      if (granted) {
        // Rebuild existing alarms so they use the newly granted exact mode.
        try {
          await widget.notificationService.refreshRoutineReminders(force: true);
        } catch (error) {
          debugPrint('Failed to re-register reminders: $error');
        }
      }
      await _refresh();
      if (!granted) {
        _showSnack(
          'Izin alarm belum aktif. Pengingat tetap berjalan, tetapi bisa '
          'datang sedikit lebih lambat.',
        );
      }
    } catch (error) {
      debugPrint('Failed to request exact-alarm permission: $error');
      await _refresh();
      _showSnack('Izin alarm belum dapat diminta. Coba lagi.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ready = _notificationsEnabled == true && _exactAlarms == true;

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0xFFCBD5E1),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppTheme.primaryBlue.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.notifications_active_rounded,
                      color: AppTheme.primaryBlue,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Text(
                      'Aktifkan Pengingat',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF1E293B),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              const Text(
                'Dinar-TB perlu izin agar pengingat minum obat muncul di ponsel '
                'Anda. Izin alarm membantu pengingat tidak tertunda.',
                style: TextStyle(
                  fontSize: 13,
                  color: Color(0xFF475569),
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 18),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Center(child: CircularProgressIndicator()),
                )
              else ...[
                _permissionRow(
                  icon: Icons.notifications_rounded,
                  label: 'Notifikasi',
                  granted: _notificationsEnabled,
                  error: _notificationsError,
                ),
                const SizedBox(height: 10),
                _permissionRow(
                  icon: Icons.alarm_rounded,
                  label: 'Alarm tepat waktu',
                  granted: _exactAlarms,
                  error: _exactAlarmsError,
                ),
                if (ready) ...[
                  const SizedBox(height: 6),
                  const Row(
                    children: [
                      Icon(
                        Icons.check_circle_rounded,
                        color: AppTheme.teal,
                        size: 20,
                      ),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Pengingat siap digunakan.',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.teal,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 18),
                if (ready)
                  FilledButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppTheme.primaryBlue,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text('Selesai'),
                  )
                else ...[
                  if (_notificationsEnabled != true)
                    _actionButton(
                      icon: Icons.notifications_active_rounded,
                      label: 'Izinkan Notifikasi',
                      onPressed: _requestNotifications,
                    ),
                  if (_exactAlarms != true)
                    _actionButton(
                      icon: Icons.alarm_on_rounded,
                      label: 'Izinkan Alarm Tepat Waktu',
                      onPressed: _requestExactAlarms,
                    ),
                  if (_notificationsError != null || _exactAlarmsError != null)
                    TextButton.icon(
                      onPressed: _refresh,
                      icon: const Icon(Icons.refresh_rounded, size: 18),
                      label: const Text('Coba Lagi'),
                    ),
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Atur Nanti'),
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _permissionRow({
    required IconData icon,
    required String label,
    required bool? granted,
    required String? error,
  }) {
    final active = granted == true;
    final color = active
        ? AppTheme.teal
        : granted == false
        ? AppTheme.yellow
        : const Color(0xFF64748B);
    final value = active
        ? 'Aktif'
        : granted == false
        ? 'Belum aktif'
        : error ?? 'Belum dapat diperiksa';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w600,
                color: Color(0xFF1E293B),
              ),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _actionButton({
    required IconData icon,
    required String label,
    required Future<void> Function() onPressed,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: FilledButton.icon(
        onPressed: _busy ? null : () => onPressed(),
        icon: Icon(icon, size: 18),
        label: Text(label),
        style: FilledButton.styleFrom(
          backgroundColor: AppTheme.primaryBlue,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }
}
