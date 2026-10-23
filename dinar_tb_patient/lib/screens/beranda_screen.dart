import 'package:flutter/material.dart';
import 'package:dinar_tb_patient/theme/app_theme.dart';
import 'package:dinar_tb_patient/widgets/patient_app_bar.dart';
import 'package:dinar_tb_patient/widgets/bottom_nav_bar.dart';
import 'package:dinar_tb_patient/widgets/sync_status_banner.dart';
import 'package:dinar_tb_patient/widgets/daily_countdown.dart';
import 'package:dinar_tb_patient/models/models.dart';
import 'package:dinar_tb_patient/repositories/schedule_repository.dart';
import 'package:dinar_tb_patient/services/notification_service.dart';
import 'package:dinar_tb_patient/services/sync_service.dart';
import 'package:dinar_tb_patient/utils/indo_date.dart';

class BerandaScreen extends StatelessWidget {
  final ScheduleRepository repository;
  final NotificationService notificationService;
  final SyncService syncService;
  final bool confirmed;

  /// Real sync state of today's confirmation, so the card can distinguish
  /// "saved on this phone" from "already accepted by the server".
  final AdherenceSyncState adherenceSyncState;
  final VoidCallback onConfirm;
  final VoidCallback onHistory;
  final VoidCallback onNotifications;
  final VoidCallback onSnooze;
  final ValueChanged<PatientTab> onNavigate;

  const BerandaScreen({
    super.key,
    required this.repository,
    required this.notificationService,
    required this.syncService,
    required this.confirmed,
    required this.adherenceSyncState,
    required this.onConfirm,
    required this.onHistory,
    required this.onNotifications,
    required this.onSnooze,
    required this.onNavigate,
  });

  Patient? get _patient => repository.getPatient();

  TreatmentCourse? get _activeTreatment => repository.getCurrentTreatment();

  ControlSchedule? get _nextSchedule => repository.getCurrentSchedule();

  List<ReminderWindow> get _windows {
    final windows = repository.getReminderWindows().toList()
      ..sort((a, b) => a.start.compareTo(b.start));
    return windows;
  }

  /// The last officer-configured window starts the daily countdown. Before it
  /// arrives the Beranda shows only the medicine reminder card.
  String get _countdownStart {
    final windows = _windows;
    return windows.isEmpty
        ? defaultReminderWindows.last.start
        : windows.last.start;
  }

  @override
  Widget build(BuildContext context) {
    final patient = _patient;
    final treatment = _activeTreatment;
    final completed = treatment?.isCompleted ?? false;
    return CustomScrollView(
      slivers: [
        SliverAppBar(
          automaticallyImplyLeading: false,
          pinned: true,
          floating: true,
          snap: true,
          backgroundColor: AppTheme.lightTheme.scaffoldBackgroundColor,
          elevation: 0,
          flexibleSpace: PatientAppBar(
            showNotification: true,
            notificationCount: syncService.needsAttentionCount,
            onNotificationPressed: onNotifications,
          ),
          expandedHeight: 0,
        ),
        SliverToBoxAdapter(
          child: Column(
            children: [
              _buildGreeting(patient),
              SyncStatusBanner(
                status: syncService.syncStatus,
                onRetry: () => syncService.forceSync(),
              ),
              if (completed)
                _buildCompletionCard(treatment!)
              else ...[
                _buildMedicineCard(),
                if (!confirmed) DailyCountdown(startTime: _countdownStart),
                if (_nextSchedule != null)
                  _buildNextControlCard(_nextSchedule!),
              ],
              if (treatment != null) _buildProgressPreview(treatment),
              _buildHistoryLink(),
              const SizedBox(height: 100), // Space for bottom nav
            ],
          ),
        ),
      ],
    );
  }

  String _greetingPrefix(DateTime now) {
    final hour = now.hour;
    if (hour < 11) return 'Selamat pagi,';
    if (hour < 15) return 'Selamat siang,';
    if (hour < 19) return 'Selamat sore,';
    return 'Selamat malam,';
  }

  String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  Widget _buildGreeting(Patient? patient) {
    final name = patient?.fullName;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _greetingPrefix(IndoDate.nowJakarta()),
                  style: const TextStyle(
                    fontSize: 14,
                    color: Color(0xFF64748B),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  name ?? 'Pasien',
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF1E293B),
                  ),
                ),
              ],
            ),
          ),
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: AppTheme.primaryBlue.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Center(
              child: Text(
                _initials(name ?? 'Pasien'),
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.primaryBlue,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCompletionCard(TreatmentCourse treatment) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppTheme.green.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.green.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppTheme.green.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.check_circle_rounded,
                  color: AppTheme.green,
                  size: 26,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      treatment.displayMessage ?? 'Pengobatan selesai',
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF1E293B),
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      'Sesuai keputusan petugas kesehatan',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppTheme.green.withValues(alpha: 0.9),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Text(
            'Terima kasih telah menyelesaikan pengobatan dan mengikuti '
            'arahan petugas. Tetap jaga kesehatan dan ikuti kontrol lanjutan '
            'bila petugas menyarankannya.',
            style: TextStyle(
              fontSize: 13,
              color: Color(0xFF475569),
              height: 1.5,
            ),
          ),
          if (treatment.completedAt != null) ...[
            const SizedBox(height: 10),
            Text(
              'Ditandai selesai ${IndoDate.medium(treatment.completedAt!.toLocal())}',
              style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildMedicineCard() {
    final windows = _windows;
    final confirmedAt = notificationService.getTodayConfirmedAt(
      _activeTreatment?.id,
    );
    final hasWindows = windows.isNotEmpty;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: confirmed
            ? AppTheme.green.withValues(alpha: 0.08)
            : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: confirmed
              ? AppTheme.green.withValues(alpha: 0.3)
              : const Color(0xFFE2E8F0),
          width: 1.5,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                confirmed
                    ? Icons.check_circle_rounded
                    : Icons.access_time_rounded,
                size: 18,
                color: confirmed ? AppTheme.green : AppTheme.yellow,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  confirmed
                      ? (confirmedAt == null
                            ? 'Sudah minum obat hari ini'
                            : 'Sudah minum obat pukul '
                                  '${IndoDate.jamMenit(confirmedAt)}')
                      : 'Belum dikonfirmasi',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: confirmed ? AppTheme.green : AppTheme.yellow,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              if (confirmed)
                _buildSyncStatusChip(adherenceSyncState)
              else
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text(
                    'Hari ini',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF475569),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: AppTheme.primaryBlue.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(
                  Icons.medication_rounded,
                  size: 28,
                  color: AppTheme.primaryBlue,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Jadwal minum obat',
                      style: TextStyle(fontSize: 13, color: Color(0xFF64748B)),
                    ),
                    const SizedBox(height: 4),
                    if (hasWindows)
                      Wrap(
                        spacing: 10,
                        runSpacing: 4,
                        children: windows
                            .map((w) => _buildTimeChip(w.start))
                            .toList(),
                      )
                    else
                      const Text(
                        'Belum ada jadwal dari petugas',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF1E293B),
                        ),
                      ),
                    const SizedBox(height: 2),
                    const Text(
                      'WIB',
                      style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            confirmed
                ? _confirmedDescription(adherenceSyncState)
                : 'Minum obat sesuai petunjuk petugas kesehatan, lalu lakukan konfirmasi.',
            style: const TextStyle(
              fontSize: 12,
              color: Color(0xFF64748B),
              height: 1.4,
            ),
          ),
          const SizedBox(height: 16),
          if (!confirmed) ...[
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                icon: const Icon(Icons.check_rounded, size: 18),
                label: const Text('Saya Sudah Minum Obat'),
                onPressed: onConfirm,
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                icon: const Icon(Icons.schedule_rounded, size: 16),
                label: const Text('Ingatkan saya 30 menit lagi'),
                onPressed: onSnooze,
              ),
            ),
          ] else ...[
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                icon: const Icon(Icons.check_rounded, size: 18),
                label: Text(
                  confirmedAt == null
                      ? 'Sudah Minum'
                      : 'Sudah Minum • ${IndoDate.jamMenit(confirmedAt)}',
                ),
                onPressed: null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.green.withValues(alpha: 0.1),
                  foregroundColor: AppTheme.green,
                  disabledBackgroundColor: AppTheme.green.withValues(
                    alpha: 0.1,
                  ),
                  disabledForegroundColor: AppTheme.green,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSyncStatusChip(AdherenceSyncState state) {
    final (IconData icon, String label, Color color) = switch (state) {
      AdherenceSyncState.synced => (
        Icons.cloud_done_rounded,
        'Tersinkron',
        AppTheme.green,
      ),
      AdherenceSyncState.pending => (
        Icons.cloud_upload_rounded,
        'Menunggu sinkronisasi',
        AppTheme.yellow,
      ),
      AdherenceSyncState.needsAttention => (
        Icons.cloud_off_rounded,
        'Menunggu sinkronisasi',
        AppTheme.yellow,
      ),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  String _confirmedDescription(AdherenceSyncState state) {
    switch (state) {
      case AdherenceSyncState.synced:
        return 'Terima kasih. Konfirmasi kamu sudah tersimpan dan tersinkron.';
      case AdherenceSyncState.pending:
        return 'Konfirmasi kamu sudah tersimpan di perangkat ini dan sedang menunggu sinkronisasi.';
      case AdherenceSyncState.needsAttention:
        return 'Konfirmasi kamu sudah tersimpan di perangkat ini. Aplikasi akan mencoba mengirim ulang saat koneksi tersedia.';
    }
  }

  Widget _buildTimeChip(String start) {
    final parts = start.split(':');
    final label = parts.length >= 2 ? '${parts[0]}.${parts[1]}' : start;
    return Text(
      label,
      style: const TextStyle(
        fontSize: 22,
        fontWeight: FontWeight.w700,
        color: Color(0xFF1E293B),
      ),
    );
  }

  Widget _buildNextControlCard(ControlSchedule schedule) {
    final date = IndoDate.parseDateOnly(schedule.scheduledDate);
    final today = IndoDate.nowJakarta();
    final clinicName = repository.getClinicName();
    final isOverridden = schedule.overriddenAt != null;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                'Kontrol Berikutnya',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF1E293B),
                ),
              ),
              const Spacer(),
              TextButton(
                onPressed: () => onNavigate(PatientTab.jadwal),
                child: const Text('Lihat detail'),
              ),
            ],
          ),
          if (isOverridden)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: AppTheme.yellow.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(
                      Icons.warning_amber_rounded,
                      color: AppTheme.yellow,
                      size: 18,
                    ),
                  ),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(
                      'Jadwal kontrol diperbarui oleh petugas.',
                      style: TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 4),
          if (date == null)
            const Text(
              'Tanggal kontrol belum tersedia.',
              style: TextStyle(fontSize: 13, color: Color(0xFF64748B)),
            )
          else
            Row(
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: AppTheme.primaryBlue,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        IndoDate.bulanSingkat(date),
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                          letterSpacing: 0.5,
                        ),
                      ),
                      Text(
                        '${date.day}',
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        IndoDate.hari(date),
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF1E293B),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        IndoDate.lengkap(date),
                        style: const TextStyle(
                          fontSize: 13,
                          color: Color(0xFF475569),
                        ),
                      ),
                      if (clinicName != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          clinicName,
                          style: const TextStyle(
                            fontSize: 12,
                            color: Color(0xFF94A3B8),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.schedule_rounded,
                      size: 14,
                      color: AppTheme.primaryBlue,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      IndoDate.labelSelisih(date, today),
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.primaryBlue,
                      ),
                    ),
                  ],
                ),
              ],
            ),
        ],
      ),
    );
  }

  Widget _buildProgressPreview(TreatmentCourse treatment) {
    final start = IndoDate.parseDateOnly(treatment.startDate);
    final end = IndoDate.parseDateOnly(
      treatment.continuedTargetEndDate ?? treatment.initialTargetEndDate,
    );
    final today = IndoDate.nowJakarta();

    double fraction = 0;
    int bulanKe = 0;
    int totalBulan = 0;
    if (start != null && end != null && end.isAfter(start)) {
      final totalDays = end.difference(start).inDays;
      final elapsed = today.difference(start).inDays.clamp(0, totalDays);
      fraction = totalDays == 0 ? 0 : elapsed / totalDays;
      totalBulan = (totalDays / 30).ceil();
      bulanKe = (elapsed / 30).floor() + 1;
      if (bulanKe > totalBulan) bulanKe = totalBulan;
    }

    final adherence = repository.getAdherenceHistory(treatment.id);
    final visits = repository.getAllVisits();

    int confirmationsThisMonth = 0;
    if (adherence != null) {
      for (final day in adherence.days) {
        if (day.status != 'Sudah diminum') continue;
        final d = IndoDate.parseDateOnly(day.date);
        if (d != null && d.year == today.year && d.month == today.month) {
          confirmationsThisMonth++;
        }
      }
    }

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Perkembangan Pengobatan',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF1E293B),
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              TextButton(
                onPressed: () => onNavigate(PatientTab.perkembangan),
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 8,
                  ),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: const [
                    Flexible(
                      child: Text(
                        'Lihat perkembangan lengkap',
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 13),
                      ),
                    ),
                    SizedBox(width: 4),
                    Icon(Icons.chevron_right_rounded, size: 18),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Text(
                treatment.isCompleted
                    ? 'Pengobatan selesai'
                    : totalBulan > 0
                    ? 'Bulan ke-$bulanKe dari $totalBulan'
                    : 'Durasi pengobatan',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF1E293B),
                ),
              ),
              const Spacer(),
              Text(
                '${(fraction * 100).round()}%',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF94A3B8),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: fraction.clamp(0, 1),
              minHeight: 8,
              backgroundColor: const Color(0xFFEEF2FF),
              valueColor: const AlwaysStoppedAnimation<Color>(
                AppTheme.primaryBlue,
              ),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _buildStatItem(
                  '$confirmationsThisMonth',
                  'Konfirmasi bulan ini',
                  AppTheme.green,
                ),
              ),
              Container(width: 1, height: 40, color: const Color(0xFFE2E8F0)),
              Expanded(
                child: _buildStatItem(
                  '${visits.length}',
                  'Kontrol selesai',
                  AppTheme.primaryBlue,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatItem(String value, String label, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Icon(Icons.check_rounded, size: 16, color: color),
              const SizedBox(width: 4),
              Text(
                value,
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: color,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildHistoryLink() {
    final confirmedAt = notificationService.getTodayConfirmedAt(
      _activeTreatment?.id,
    );
    final subtitle = confirmed
        ? confirmedAt == null
              ? 'Hari ini sudah dikonfirmasi'
              : 'Hari ini sudah dikonfirmasi pukul '
                    '${IndoDate.jamMenit(confirmedAt)}'
        : 'Lihat konfirmasi harian Anda';

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: InkWell(
        onTap: onHistory,
        borderRadius: BorderRadius.circular(14),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(
                Icons.history_rounded,
                size: 22,
                color: Color(0xFF475569),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Riwayat Minum Obat',
                    style: TextStyle(
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
            const Icon(
              Icons.chevron_right_rounded,
              color: Color(0xFF94A3B8),
              size: 22,
            ),
          ],
        ),
      ),
    );
  }
}
