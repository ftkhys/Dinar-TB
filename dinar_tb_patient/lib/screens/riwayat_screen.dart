import 'package:flutter/material.dart';
import 'package:dinar_tb_patient/theme/app_theme.dart';
import 'package:dinar_tb_patient/widgets/patient_app_bar.dart';
import 'package:dinar_tb_patient/widgets/sync_status_banner.dart';
import 'package:dinar_tb_patient/models/models.dart';
import 'package:dinar_tb_patient/services/api_client.dart';
import 'package:dinar_tb_patient/services/notification_service.dart';
import 'package:dinar_tb_patient/services/sync_service.dart';
import 'package:dinar_tb_patient/repositories/schedule_repository.dart';
import 'package:dinar_tb_patient/utils/indo_date.dart';

class RiwayatScreen extends StatefulWidget {
  const RiwayatScreen({
    super.key,
    required this.repository,
    required this.apiClient,
    required this.syncService,
    required this.notificationService,
  });

  final ScheduleRepository repository;
  final ApiClient apiClient;
  final SyncService syncService;
  final NotificationService notificationService;

  @override
  State<RiwayatScreen> createState() => _RiwayatScreenState();
}

class _RiwayatScreenState extends State<RiwayatScreen> {
  AdherenceHistory? _history;
  bool _isLoading = true;
  String? _error;
  bool _usingCache = false;

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  Future<void> _loadHistory() async {
    setState(() {
      _isLoading = true;
      _error = null;
      _usingCache = false;
    });

    final activeTreatment = widget.repository.getCurrentTreatment();
    if (activeTreatment == null) {
      if (mounted) {
        setState(() {
          _history = null;
          _isLoading = false;
        });
      }
      return;
    }

    try {
      final history = await widget.apiClient.getAdherenceHistory(
        activeTreatment.id,
      );
      final merged = widget.notificationService.historyWithToday(
        history,
        treatmentId: activeTreatment.id,
      );
      if (merged != null) {
        await widget.repository.saveAdherenceHistory(
          activeTreatment.id,
          merged,
        );
      }
      if (mounted) {
        setState(() {
          _history = merged ?? history;
          _isLoading = false;
        });
      }
    } on ApiException catch (e) {
      // Network/server failure: fall back to the cached copy so the patient can
      // still see their history offline, and say so honestly. A local
      // confirmation made while offline is overlaid on top of the cache.
      final cached = widget.repository.getAdherenceHistory(activeTreatment.id);
      final merged = widget.notificationService.historyWithToday(
        cached,
        treatmentId: activeTreatment.id,
      );
      if (mounted) {
        setState(() {
          _history = merged;
          _usingCache = merged != null;
          _error = merged == null ? e.message : null;
          _isLoading = false;
        });
      }
    } catch (e) {
      final cached = widget.repository.getAdherenceHistory(activeTreatment.id);
      final merged = widget.notificationService.historyWithToday(
        cached,
        treatmentId: activeTreatment.id,
      );
      if (mounted) {
        setState(() {
          _history = merged;
          _usingCache = merged != null;
          _error = merged == null
              ? 'Gagal memuat riwayat. Periksa koneksi lalu coba lagi.'
              : null;
          _isLoading = false;
        });
      }
    }
  }

  String _normalizeStatus(String status) {
    switch (status) {
      case 'TAKEN':
      case 'Sudah diminum':
        return 'Sudah diminum';
      case 'NOT_CONFIRMED':
      case 'Belum dikonfirmasi':
        return 'Belum dikonfirmasi';
      case 'MISSED':
      case 'Terlewat':
        return 'Terlewat';
      default:
        return status;
    }
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'Sudah diminum':
        return 'Sudah dikonfirmasi';
      default:
        return status;
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'Sudah diminum':
        return AppTheme.green;
      case 'Belum dikonfirmasi':
        return AppTheme.yellow;
      case 'Terlewat':
        return AppTheme.red;
      default:
        return Colors.grey;
    }
  }

  IconData _statusIcon(String status) {
    switch (status) {
      case 'Sudah diminum':
        return Icons.check_circle_rounded;
      case 'Belum dikonfirmasi':
        return Icons.access_time_rounded;
      case 'Terlewat':
        return Icons.cancel_rounded;
      default:
        return Icons.help_outline_rounded;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.lightTheme.scaffoldBackgroundColor,
      appBar: PatientAppBar(
        title: 'Riwayat Minum Obat',
        showBack: true,
        onBack: () => Navigator.of(context).pop(),
        showNotification: false,
      ),
      body: Column(
        children: [
          const SizedBox(height: 8),
          SyncStatusBanner(
            status: widget.syncService.syncStatus,
            onRetry: () => widget.syncService.forceSync(),
          ),
          Expanded(child: _buildBody()),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(color: AppTheme.primaryBlue),
      );
    }
    if (_error != null) return _buildErrorState();
    if (_history == null || _history!.days.isEmpty) return _buildEmptyState();
    return _buildHistoryList();
  }

  Widget _buildErrorState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.error_outline_rounded,
              size: 64,
              color: AppTheme.red,
            ),
            const SizedBox(height: 16),
            const Text(
              'Gagal Memuat Riwayat',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: Color(0xFF1E293B),
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              _error ?? 'Terjadi kesalahan',
              style: const TextStyle(fontSize: 14, color: Color(0xFF64748B)),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _loadHistory,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Coba Lagi'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.history_rounded,
              size: 64,
              color: Color(0xFF94A3B8),
            ),
            const SizedBox(height: 16),
            const Text(
              'Belum Ada Riwayat',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: Color(0xFF1E293B),
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            const Text(
              'Riwayat akan muncul setelah Anda mengonfirmasi minum obat.',
              style: TextStyle(fontSize: 14, color: Color(0xFF64748B)),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _loadHistory,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Muat Ulang'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHistoryList() {
    final days = _history!.days;
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: days.length + (_usingCache ? 1 : 0),
      itemBuilder: (context, index) {
        if (_usingCache && index == 0) {
          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF7ED),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFFDE68A)),
            ),
            child: Row(
              children: const [
                Icon(
                  Icons.wifi_off_rounded,
                  size: 16,
                  color: Color(0xFF92400E),
                ),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Menampilkan data tersimpan. Hubungkan internet untuk memperbarui.',
                    style: TextStyle(fontSize: 12, color: Color(0xFF92400E)),
                  ),
                ),
              ],
            ),
          );
        }
        final dayIndex = index - (_usingCache ? 1 : 0);
        final day = days[days.length - 1 - dayIndex];
        final status = _normalizeStatus(day.status);
        final date = IndoDate.parseDateOnly(day.date);
        final confirmedAt = IndoDate.parseIsoJakarta(day.confirmedAt);

        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: Color(0xFFE2E8F0)),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                SizedBox(
                  width: 78,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        date == null ? day.date : IndoDate.hari(date),
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF1E293B),
                        ),
                      ),
                      Text(
                        date == null ? '' : IndoDate.medium(date),
                        style: const TextStyle(
                          fontSize: 13,
                          color: Color(0xFF64748B),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: _statusColor(status).withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Center(
                    child: Icon(
                      _statusIcon(status),
                      color: _statusColor(status),
                      size: 24,
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _statusLabel(status),
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: _statusColor(status),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        confirmedAt != null
                            ? 'Dikonfirmasi ${IndoDate.jamMenit(confirmedAt)}'
                            : 'Tidak ada data konfirmasi',
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xFF64748B),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
