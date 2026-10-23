import 'package:flutter/material.dart';
import 'package:dinar_tb_patient/theme/app_theme.dart';
import 'package:dinar_tb_patient/widgets/patient_app_bar.dart';
import 'package:dinar_tb_patient/widgets/sync_status_banner.dart';
import 'package:dinar_tb_patient/services/sync_service.dart';
import 'package:dinar_tb_patient/utils/indo_date.dart';

/// Notification centre: surfaces offline confirmations that still need to be
/// sent, so the user has a place to act instead of a silent failure.
class NotificationsScreen extends StatelessWidget {
  final SyncService syncService;

  const NotificationsScreen({super.key, required this.syncService});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.lightTheme.scaffoldBackgroundColor,
      appBar: PatientAppBar(
        title: 'Pemberitahuan',
        showBack: true,
        showNotification: false,
      ),
      body: AnimatedBuilder(
        animation: syncService.syncStatus,
        builder: (context, _) {
          final needsAttention = syncService.getOperationsNeedingAttention();
          final pending = syncService.getPendingOperations();

          return ListView(
            padding: const EdgeInsets.only(bottom: 24),
            children: [
              const SizedBox(height: 8),
              SyncStatusBanner(
                status: syncService.syncStatus,
                onRetry: () => syncService.forceSync(),
              ),
              if (needsAttention.isEmpty && pending.isEmpty)
                _buildEmpty()
              else ...[
                if (needsAttention.isNotEmpty) ...[
                  _buildSectionTitle('Perlu perhatian'),
                  ...needsAttention.map(
                    (op) => _buildOperationTile(
                      context,
                      date: op.adherenceDate,
                      subtitle:
                          'Gagal terkirim setelah ${op.retryCount} percobaan.',
                      color: AppTheme.red,
                      icon: Icons.error_outline_rounded,
                      onRetry: () async {
                        await syncService.retryOperation(op.operationId);
                      },
                    ),
                  ),
                ],
                if (pending.isNotEmpty) ...[
                  _buildSectionTitle('Menunggu dikirim'),
                  ...pending.map(
                    (op) => _buildOperationTile(
                      context,
                      date: op.adherenceDate,
                      subtitle: 'Akan dikirim saat koneksi tersedia.',
                      color: const Color(0xFF475569),
                      icon: Icons.schedule_rounded,
                    ),
                  ),
                ],
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _buildEmpty() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 48),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: AppTheme.green.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.check_circle_outline_rounded,
              color: AppTheme.green,
              size: 34,
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'Tidak ada pemberitahuan',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: Color(0xFF1E293B),
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Semua konfirmasi Anda sudah tersinkron dengan server.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: Color(0xFF64748B)),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
      child: Text(
        title,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: Color(0xFF64748B),
          letterSpacing: 0.3,
        ),
      ),
    );
  }

  Widget _buildOperationTile(
    BuildContext context, {
    required String date,
    required String subtitle,
    required Color color,
    required IconData icon,
    Future<void> Function()? onRetry,
  }) {
    final parsed = IndoDate.parseDateOnly(date);
    final label = parsed == null ? date : IndoDate.lengkap(parsed);
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Konfirmasi $label',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF1E293B),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFF64748B),
                  ),
                ),
              ],
            ),
          ),
          if (onRetry != null)
            TextButton(
              onPressed: () async {
                await onRetry();
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Mencoba mengirim ulang...'),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                }
              },
              child: const Text('Kirim ulang'),
            ),
        ],
      ),
    );
  }
}
