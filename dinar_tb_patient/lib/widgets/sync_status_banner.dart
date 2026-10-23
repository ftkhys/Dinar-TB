import 'package:flutter/material.dart';
import 'package:dinar_tb_patient/theme/app_theme.dart';
import 'package:dinar_tb_patient/services/sync_status.dart';

/// Honest, non-blocking sync indicator. Hidden while everything is fine so it
/// does not add noise; otherwise it explains offline/failed/pending states.
class SyncStatusBanner extends StatelessWidget {
  final SyncStatusNotifier status;
  final VoidCallback? onRetry;

  const SyncStatusBanner({super.key, required this.status, this.onRetry});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: status,
      builder: (context, _) {
        final style = _resolve();
        if (style == null) return const SizedBox.shrink();
        return Container(
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: style.background,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: style.border),
          ),
          child: Row(
            children: [
              if (style.showSpinner)
                SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: style.foreground,
                  ),
                )
              else
                Icon(style.icon, size: 18, color: style.foreground),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  style.message,
                  style: TextStyle(
                    fontSize: 12,
                    height: 1.35,
                    color: style.foreground,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              if (onRetry != null && style.showRetry)
                TextButton(
                  onPressed: onRetry,
                  style: TextButton.styleFrom(
                    foregroundColor: style.foreground,
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text('Coba lagi'),
                ),
            ],
          ),
        );
      },
    );
  }

  _BannerStyle? _resolve() {
    if (!status.hasConnectivity) {
      return const _BannerStyle(
        message:
            'Anda sedang offline. Data yang tampil berasal dari penyimpanan terakhir.',
        icon: Icons.wifi_off_rounded,
        foreground: Color(0xFF92400E),
        background: Color(0xFFFFF7ED),
        border: Color(0xFFFDE68A),
      );
    }
    if (status.isSyncing) {
      return const _BannerStyle(
        message: 'Menyinkronkan data...',
        icon: Icons.sync_rounded,
        foreground: AppTheme.primaryBlue,
        background: Color(0xFFEEF2FF),
        border: Color(0xFFC7D2FE),
        showSpinner: true,
      );
    }
    if (status.needsAttentionCount > 0) {
      return _BannerStyle(
        message:
            '${status.needsAttentionCount} konfirmasi belum terkirim. Buka Pemberitahuan untuk mencoba lagi.',
        icon: Icons.error_outline_rounded,
        foreground: AppTheme.red,
        background: const Color(0xFFFEF2F2),
        border: const Color(0xFFFECACA),
        showRetry: true,
      );
    }
    if (status.lastError != null) {
      return _BannerStyle(
        message: status.lastError!,
        icon: Icons.cloud_off_rounded,
        foreground: const Color(0xFF92400E),
        background: const Color(0xFFFFF7ED),
        border: const Color(0xFFFDE68A),
        showRetry: true,
      );
    }
    if (status.pendingCount > 0) {
      return _BannerStyle(
        message:
            '${status.pendingCount} konfirmasi menunggu dikirim ke server.',
        icon: Icons.schedule_rounded,
        foreground: const Color(0xFF475569),
        background: const Color(0xFFF1F5F9),
        border: const Color(0xFFE2E8F0),
        showRetry: true,
      );
    }
    return null;
  }
}

class _BannerStyle {
  final String message;
  final IconData icon;
  final Color foreground;
  final Color background;
  final Color border;
  final bool showSpinner;
  final bool showRetry;

  const _BannerStyle({
    required this.message,
    required this.icon,
    required this.foreground,
    required this.background,
    required this.border,
    this.showSpinner = false,
    this.showRetry = false,
  });
}
