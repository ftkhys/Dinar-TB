import 'dart:async';

import 'package:flutter/foundation.dart' show kReleaseMode;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:dinar_tb_patient/theme/app_theme.dart';
import 'package:dinar_tb_patient/widgets/patient_app_bar.dart';
import 'package:dinar_tb_patient/widgets/sync_status_banner.dart';
import 'package:dinar_tb_patient/repositories/schedule_repository.dart';
import 'package:dinar_tb_patient/services/notification_service.dart';
import 'package:dinar_tb_patient/services/sync_service.dart';
import 'package:dinar_tb_patient/models/models.dart';
import 'package:dinar_tb_patient/utils/indo_date.dart';

class ProfilScreen extends StatelessWidget {
  final ScheduleRepository repository;
  final NotificationService notificationService;
  final SyncService syncService;

  /// Ends the locally stored session and routes back to activation. Data on the
  /// server is never touched.
  final Future<void> Function() onLogout;

  const ProfilScreen({
    super.key,
    required this.repository,
    required this.notificationService,
    required this.syncService,
    required this.onLogout,
  });

  TreatmentCourse? get _activeTreatment => repository.getCurrentTreatment();

  ControlSchedule? get _activeSchedule => repository.getCurrentSchedule();

  @override
  Widget build(BuildContext context) {
    final patient = repository.getPatient();
    final treatment = _activeTreatment;
    final clinicName = repository.getClinicName();

    return CustomScrollView(
      slivers: [
        SliverAppBar(
          automaticallyImplyLeading: false,
          pinned: true,
          floating: true,
          snap: true,
          backgroundColor: AppTheme.lightTheme.scaffoldBackgroundColor,
          elevation: 0,
          flexibleSpace: const PatientAppBar(
            title: 'Profil Saya',
            showBack: false,
            showNotification: false,
          ),
          expandedHeight: 0,
        ),
        SliverToBoxAdapter(
          child: Column(
            children: [
              const SizedBox(height: 8),
              SyncStatusBanner(
                status: syncService.syncStatus,
                onRetry: () => syncService.forceSync(),
              ),
              _buildProfileHeader(patient, treatment),
              _buildTreatmentInfo(treatment),
              _buildMenuList(context, clinicName),
              _buildEmergencyNote(),
              _buildVersion(),
              const SizedBox(height: 100),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildProfileHeader(
    Patient? patient,
    TreatmentCourse? activeTreatment,
  ) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          Text(
            patient?.fullName ?? 'Data tidak tersedia',
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w700,
              color: Color(0xFF1E293B),
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Nomor Register',
            style: TextStyle(fontSize: 13, color: Color(0xFF64748B)),
          ),
          const SizedBox(height: 2),
          Text(
            patient?.registerNumber ?? '-',
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: Color(0xFF1E293B),
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: _treatmentStatusColor(
                activeTreatment,
              ).withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              _treatmentStatus(activeTreatment),
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: _treatmentStatusColor(activeTreatment),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _treatmentStatus(TreatmentCourse? treatment) {
    if (treatment == null) return 'Tidak ada data pengobatan';
    return treatment.isActive ? 'Pengobatan aktif' : 'Pengobatan selesai';
  }

  Color _treatmentStatusColor(TreatmentCourse? treatment) {
    if (treatment == null) return Colors.grey;
    return treatment.isActive ? AppTheme.green : Colors.grey;
  }

  Widget _buildTreatmentInfo(TreatmentCourse? treatment) {
    final schedule = _activeSchedule;
    final reminderWindows = repository.getReminderWindows().toList()
      ..sort((a, b) => a.start.compareTo(b.start));

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Informasi Pengobatan',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: Color(0xFF1E293B),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            _dataSourceLabel(repository.getLastSyncTime()),
            style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
          ),
          const SizedBox(height: 16),
          if (treatment == null)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF7ED),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: AppTheme.yellow.withValues(alpha: 0.3),
                ),
              ),
              child: Row(
                children: const [
                  Icon(
                    Icons.info_outline_rounded,
                    size: 18,
                    color: AppTheme.yellow,
                  ),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Belum ada data pengobatan yang tersinkron. Buka aplikasi saat online untuk sinkronisasi.',
                      style: TextStyle(
                        fontSize: 12,
                        color: Color(0xFF78350F),
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            )
          else ...[
            _buildInfoRow(
              'Mulai pengobatan',
              _formatDateId(treatment.startDate),
            ),
            _buildInfoRow('Tahap saat ini', _currentPhase(treatment)),
            if (schedule != null)
              _buildInfoRow(
                'Kontrol berikutnya',
                _formatDateId(schedule.scheduledDate),
              ),
            if (reminderWindows.isNotEmpty)
              _buildInfoRow(
                'Waktu pengingat obat',
                reminderWindows.map((w) => _formatWindow(w.start)).join(' & '),
              ),
          ],
        ],
      ),
    );
  }

  String _dataSourceLabel(DateTime? lastSyncTime) {
    if (lastSyncTime == null) return 'Data belum disinkronkan';
    return 'Terakhir disinkronkan: ${IndoDate.medium(lastSyncTime)} ${IndoDate.jamMenit(lastSyncTime)}';
  }

  String _formatDateId(String? dateStr) {
    final date = IndoDate.parseDateOnly(dateStr);
    return date == null ? '-' : IndoDate.lengkap(date);
  }

  String _formatWindow(String start) {
    final parts = start.split(':');
    if (parts.length >= 2) return '${parts[0]}.${parts[1]} WIB';
    return '$start WIB';
  }

  String _currentPhase(TreatmentCourse treatment) {
    if (treatment.isCompleted) return 'Selesai';
    final start = IndoDate.parseDateOnly(treatment.startDate);
    if (start == null) return '-';
    final today = IndoDate.nowJakarta();
    final diff = today.difference(start).inDays;
    if (diff < 0) return 'Belum dimulai';
    final months = (diff / 30).floor() + 1;
    return 'Bulan ke-$months';
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(fontSize: 13, color: Color(0xFF64748B)),
            ),
          ),
          Flexible(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Color(0xFF1E293B),
              ),
              textAlign: TextAlign.right,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMenuList(BuildContext context, String? clinicName) {
    final items = [
      _MenuItem(
        icon: Icons.help_outline_rounded,
        iconColor: AppTheme.primaryBlue,
        title: 'Bantuan & Informasi',
        subtitle: 'Cara menggunakan Dinar-TB',
        onTap: () => _showHelpDialog(context, clinicName),
      ),
      _MenuItem(
        icon: Icons.people_rounded,
        iconColor: AppTheme.teal,
        title: 'Hubungi Petugas',
        subtitle: clinicName ?? 'Puskesmas',
        onTap: () => _showContactDialog(context, clinicName),
      ),
      _MenuItem(
        icon: Icons.notifications_active_rounded,
        iconColor: AppTheme.yellow,
        title: 'Pengaturan Notifikasi',
        subtitle: 'Izin notifikasi & alarm pengingat',
        onTap: () => _openNotificationSettings(context),
      ),
      _MenuItem(
        icon: Icons.logout_rounded,
        iconColor: AppTheme.red,
        title: 'Keluar Akun',
        subtitle: 'Perlu kode aktivasi baru untuk masuk',
        onTap: () => _confirmLogout(context),
      ),
    ];

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        children: items
            .asMap()
            .entries
            .map(
              (entry) => _buildMenuItem(entry.value, entry.key, items.length),
            )
            .toList(),
      ),
    );
  }

  Widget _buildMenuItem(_MenuItem item, int index, int total) {
    return InkWell(
      onTap: item.onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: index == total - 1
                  ? Colors.transparent
                  : const Color(0xFFE2E8F0),
            ),
          ),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: item.iconColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(item.icon, size: 22, color: item.iconColor),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.title,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF1E293B),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    item.subtitle,
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

  Future<void> _confirmLogout(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: const Text('Keluar dari akun?'),
        content: const Text(
          'Anda akan keluar dari akun ini. Untuk menggunakan Dinar-TB lagi, '
          'Anda harus memasukkan kode aktivasi baru dari petugas Puskesmas.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Batal'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Keluar'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    // Never drop offline confirmations silently. Send them first, or require an
    // explicit acknowledgement that they will be lost from this device.
    final unsynced =
        syncService.pendingAdherenceCount + syncService.needsAttentionCount;
    if (unsynced > 0) {
      final choice = await showDialog<_LogoutChoice>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          title: const Text('Data belum tersinkronisasi'),
          content: Text(
            'Ada $unsynced konfirmasi obat yang belum terkirim ke server. '
            'Jika Anda keluar sekarang, data tersebut akan dihapus dari '
            'perangkat dan tidak dapat dipulihkan.\n\n'
            'Sambungkan internet lalu kirim data terlebih dahulu.',
          ),
          actions: [
            TextButton(
              onPressed: () =>
                  Navigator.of(dialogContext).pop(_LogoutChoice.cancel),
              child: const Text('Batal'),
            ),
            TextButton(
              onPressed: () =>
                  Navigator.of(dialogContext).pop(_LogoutChoice.sendNow),
              child: const Text('Kirim sekarang'),
            ),
            TextButton(
              onPressed: () =>
                  Navigator.of(dialogContext).pop(_LogoutChoice.logoutAnyway),
              child: const Text(
                'Tetap keluar',
                style: TextStyle(color: AppTheme.red),
              ),
            ),
          ],
        ),
      );

      if (choice == _LogoutChoice.sendNow) {
        await syncService.forceSync();
        if (!context.mounted) return;
        final remaining =
            syncService.pendingAdherenceCount + syncService.needsAttentionCount;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              remaining == 0
                  ? 'Semua konfirmasi sudah terkirim. Silakan keluar kembali.'
                  : 'Masih ada $remaining konfirmasi yang belum terkirim. '
                        'Periksa koneksi lalu coba lagi.',
            ),
            behavior: SnackBarBehavior.floating,
          ),
        );
        return;
      }
      if (choice != _LogoutChoice.logoutAnyway) return;
    }

    await onLogout();
  }

  Future<void> _openNotificationSettings(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) =>
          NotificationSettingsSheet(notificationService: notificationService),
    );
  }

  void _showHelpDialog(BuildContext context, String? clinicName) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _HelpBottomSheet(clinicName: clinicName),
    );
  }

  void _showContactDialog(BuildContext context, String? clinicName) {
    final phone = repository.getClinicPhone();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
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
            const Text(
              'Hubungi Petugas',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: Color(0xFF1E293B),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              clinicName ?? 'Puskesmas',
              style: const TextStyle(fontSize: 14, color: Color(0xFF475569)),
            ),
            const SizedBox(height: 16),
            if (phone != null && phone.isNotEmpty)
              Row(
                children: [
                  const Icon(
                    Icons.phone_rounded,
                    size: 20,
                    color: AppTheme.primaryBlue,
                  ),
                  const SizedBox(width: 10),
                  Text(
                    phone,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF1E293B),
                    ),
                  ),
                ],
              )
            else
              const Text(
                'Nomor telepon resmi belum terdaftar di aplikasi. Silakan kunjungi Puskesmas langsung atau hubungi melalui saluran resmi.',
                style: TextStyle(
                  fontSize: 13,
                  color: Color(0xFF475569),
                  height: 1.5,
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmergencyNote() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF2F2),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.red.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          Icon(Icons.warning_amber_rounded, size: 22, color: AppTheme.red),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Butuh bantuan terkait obat?',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF991B1B),
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  'Jangan mengubah atau menghentikan obat sendiri. Hubungi petugas kesehatan terlebih dahulu.',
                  style: TextStyle(
                    fontSize: 12,
                    color: Color(0xFFB91C1C),
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVersion() {
    return const Padding(
      padding: EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      child: Text(
        'Dinar-TB versi 1.0.0',
        style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
      ),
    );
  }
}

enum _LogoutChoice { cancel, sendNow, logoutAnyway }

class _MenuItem {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _MenuItem({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
}

class _HelpBottomSheet extends StatelessWidget {
  final String? clinicName;

  const _HelpBottomSheet({this.clinicName});

  @override
  Widget build(BuildContext context) {
    const faqs = [
      [
        'Bagaimana cara konfirmasi obat?',
        'Setelah minum obat sesuai petunjuk, buka Beranda lalu tekan "Saya Sudah Minum Obat". Konfirmasi hanya berlaku untuk hari ini.',
      ],
      [
        'Mengapa ada status belum dikonfirmasi?',
        'Status ini hanya berarti aplikasi belum menerima konfirmasi. Obat tidak ditandai terlewat sebelum hari berakhir.',
      ],
      [
        'Jadwal kontrol berubah',
        'Perubahan jadwal hanya dilakukan petugas. Periksa tab Jadwal dan hubungi Puskesmas jika Anda berhalangan.',
      ],
      [
        'Notifikasi tidak muncul',
        'Pengingat obat dijadwalkan langsung di HP Anda dan tetap berjalan tanpa internet. '
            'Pastikan izin notifikasi Dinar-TB aktif dan berikan izin "Alarm & pengingat" pada pengaturan Android '
            'agar pengingat muncul tepat waktu. Internet hanya diperlukan untuk mengirim konfirmasi ke petugas.',
      ],
    ];

    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      maxChildSize: 0.9,
      minChildSize: 0.5,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: Column(
            children: [
              Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(top: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFFCBD5E1),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AppTheme.primaryBlue.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(
                        Icons.help_outline_rounded,
                        size: 26,
                        color: AppTheme.primaryBlue,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Flexible(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: const [
                          Text(
                            'Kami siap membantu',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF1E293B),
                            ),
                          ),
                          Text(
                            'Temukan jawaban singkat tentang penggunaan Dinar-TB.',
                            style: TextStyle(
                              fontSize: 13,
                              color: Color(0xFF64748B),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView.separated(
                  controller: scrollController,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: faqs.length,
                  separatorBuilder: (context, index) =>
                      const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final faq = faqs[index];
                    return Theme(
                      data: Theme.of(
                        context,
                      ).copyWith(dividerColor: Colors.transparent),
                      child: ExpansionTile(
                        initiallyExpanded: index == 0,
                        tilePadding: const EdgeInsets.all(16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: const BorderSide(color: Color(0xFFE2E8F0)),
                        ),
                        collapsedShape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: const BorderSide(color: Color(0xFFE2E8F0)),
                        ),
                        title: Text(
                          faq[0],
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF1E293B),
                          ),
                        ),
                        childrenPadding: const EdgeInsets.fromLTRB(
                          16,
                          0,
                          16,
                          16,
                        ),
                        children: [
                          Text(
                            faq[1],
                            style: const TextStyle(
                              fontSize: 13,
                              color: Color(0xFF475569),
                              height: 1.5,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                child: Column(
                  children: [
                    const Divider(height: 1),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEEF2FF),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: AppTheme.primaryBlue.withValues(alpha: 0.3),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: const [
                              Icon(
                                Icons.people_rounded,
                                size: 20,
                                color: AppTheme.primaryBlue,
                              ),
                              SizedBox(width: 10),
                              Flexible(
                                child: Text(
                                  'Masih butuh bantuan?',
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                    color: Color(0xFF1E293B),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Buka menu "Hubungi Petugas" pada halaman Profil untuk melihat kontak ${clinicName ?? 'Puskesmas'} yang tersimpan.',
                            style: const TextStyle(
                              fontSize: 13,
                              color: Color(0xFF475569),
                              height: 1.4,
                            ),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Aplikasi ini hanya membantu pencatatan dan pengingat. '
                            'Segala keputusan medis harus dikonsultasikan dengan petugas kesehatan TB.',
                            style: TextStyle(
                              fontSize: 11,
                              color: Color(0xFF94A3B8),
                              height: 1.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Public so widget tests can verify the simplified, user-facing status and
/// the one-off permission recovery actions.
class NotificationSettingsSheet extends StatefulWidget {
  final NotificationService notificationService;

  /// Test notifications are a development aid. Release builds keep the real
  /// reminder controls but never expose these buttons to patients.
  final bool showTestTools;

  const NotificationSettingsSheet({
    super.key,
    required this.notificationService,
    this.showTestTools = !kReleaseMode,
  });

  @override
  State<NotificationSettingsSheet> createState() =>
      _NotificationSettingsSheetState();
}

class _NotificationSettingsSheetState extends State<NotificationSettingsSheet>
    with WidgetsBindingObserver {
  bool _loading = true;
  bool _busy = false;
  bool? _notificationsEnabled;
  bool? _exactAlarms;
  int? _pendingCount;
  bool _schedulingFailed = false;
  String? _notificationsError;
  String? _exactAlarmsError;
  String? _pendingError;

  /// Set only when every probe failed, i.e. the notification layer itself is
  /// unavailable. A single failing diagnostic must not hide the reminder state.
  String? _error;

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
    // Permission screens are outside the app, so re-read the real state when
    // the patient comes back instead of leaving a stale "not allowed" label.
    if (state == AppLifecycleState.resumed && !_busy) {
      _refresh();
    }
  }

  Future<void> _refresh() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
      _notificationsError = null;
      _exactAlarmsError = null;
      _pendingError = null;
    });

    bool? enabled;
    String? enabledError;
    try {
      enabled = await _probe(
        widget.notificationService.areNotificationsEnabled,
      );
    } catch (error) {
      enabledError = _describeError(error, 'Izin notifikasi');
    }

    bool? exact;
    String? exactError;
    try {
      exact = await _probe(widget.notificationService.canScheduleExactAlarms);
    } catch (error) {
      exactError = _describeError(error, 'Izin alarm');
    }

    int? pending;
    String? pendingError;
    try {
      pending = await _probe(
        widget.notificationService.pendingNotificationCount,
      );
    } catch (error) {
      pendingError = _describeError(error, 'Daftar pengingat');
    }

    if (!mounted) return;
    final allFailed =
        enabledError != null && exactError != null && pendingError != null;
    setState(() {
      _notificationsEnabled = enabled;
      _exactAlarms = exact;
      _pendingCount = pending;
      _schedulingFailed =
          widget.notificationService.hasReminderSchedulingFailure;
      _notificationsError = enabledError;
      _exactAlarmsError = exactError;
      _pendingError = pendingError;
      _loading = false;
      if (allFailed) {
        _error =
            'Pengaturan notifikasi tidak dapat dimuat. Tutup lalu buka '
            'kembali aplikasi Dinar-TB, lalu coba lagi.';
      }
    });
  }

  /// A platform probe that must never keep the sheet on a spinner forever.
  Future<T> _probe<T>(Future<T> Function() call) =>
      call().timeout(const Duration(seconds: 6));

  String _describeError(Object error, String label) {
    debugPrint('Failed to read $label: $error');
    if (error is TimeoutException) {
      return 'Layanan notifikasi tidak merespons';
    }
    if (error is MissingPluginException) {
      return 'Layanan notifikasi belum siap di perangkat ini';
    }
    return 'Status belum dapat diperiksa';
  }

  void _showSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 3),
      ),
    );
  }

  Future<void> _enableNotifications() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final granted = await widget.notificationService.requestPermission();
      await _refresh();
      if (!granted) {
        _showSnack(
          'Izin notifikasi belum aktif. Aktifkan dari Pengaturan Android > '
          'Aplikasi > Dinar-TB > Notifikasi.',
        );
      }
    } catch (error) {
      debugPrint('Failed to request notification permission: $error');
      _showSnack(
        'Izin notifikasi belum dapat diminta. Buka Pengaturan Android > '
        'Aplikasi > Dinar-TB > Notifikasi.',
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _requestExactAlarm() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final granted = await widget.notificationService
          .requestExactAlarmPermission();
      if (granted) {
        // Existing alarms were registered with the previous (possibly
        // inexact) mode. Re-register them so the new permission takes effect.
        try {
          await widget.notificationService.refreshRoutineReminders(force: true);
        } catch (error) {
          debugPrint(
            'Failed to re-register reminders after exact grant: $error',
          );
        }
      }
      await _refresh();
      _showSnack(
        granted
            ? 'Izin alarm aktif. Pengingat bisa dijadwalkan lebih tepat waktu.'
            : 'Izin alarm belum diberikan. Pengingat tetap berjalan, tetapi '
                  'bisa datang sedikit lebih lambat.',
      );
    } catch (error) {
      debugPrint('Failed to request exact-alarm permission: $error');
      await _refresh();
      _showSnack(
        'Izin alarm belum dapat diminta. Buka Pengaturan Aplikasi untuk '
        'mengaktifkannya.',
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Re-registers the routine alarms after a real scheduling failure. A
  /// pending-list refresh alone cannot repair alarms that were never created.
  Future<void> _rescheduleReminders() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await widget.notificationService
          .refreshRoutineReminders(force: true)
          .timeout(const Duration(seconds: 15));
      await _refresh();
      if (!mounted) return;
      _showSnack(
        widget.notificationService.hasReminderSchedulingFailure
            ? 'Sebagian pengingat masih belum dapat dijadwalkan. Periksa izin '
                  'alarm dan notifikasi.'
            : 'Pengingat berhasil dijadwalkan ulang.',
      );
    } catch (error) {
      debugPrint('Failed to reschedule reminders: $error');
      await _refresh();
      if (!mounted) return;
      _showSnack(
        'Pengingat belum dapat dijadwalkan ulang. Periksa izin alarm dan '
        'notifikasi, lalu coba lagi.',
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openAppSettings() async {
    final opened = await openAppSettings();
    if (!opened) {
      _showSnack(
        'Buka Pengaturan Android > Aplikasi > Dinar-TB untuk mengatur izin.',
      );
    }
  }

  Future<void> _sendTestNotification() async {
    if (_busy) return;
    try {
      await widget.notificationService.showTestNotification();
      _showSnack(
        'Notifikasi uji dikirim. Jika banner atau suara tidak muncul, periksa '
        'mode Senyap, Jangan Ganggu, dan volume notifikasi.',
      );
    } catch (error) {
      debugPrint('Failed to send the test notification: $error');
      _showSnack(
        'Notifikasi uji gagal dikirim. Periksa izin dan pengaturan suara.',
      );
    }
  }

  Future<void> _scheduleTestNotification() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await widget.notificationService.scheduleTestNotification();
      await _refresh();
      _showSnack(
        'Notifikasi uji dijadwalkan sekitar 1 menit lagi. Tutup aplikasi '
        'untuk memastikan notifikasi tetap muncul.',
      );
    } catch (error) {
      debugPrint('Failed to schedule the test notification: $error');
      _showSnack(
        'Notifikasi uji gagal dijadwalkan. Periksa izin notifikasi dan alarm.',
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  ({IconData icon, Color color, String value}) get _reminderStatus {
    if (_notificationsEnabled == false) {
      return (
        icon: Icons.error_rounded,
        color: AppTheme.red,
        value: 'Notifikasi belum diizinkan.',
      );
    }
    if (_notificationsError != null) {
      return (
        icon: Icons.help_outline_rounded,
        color: const Color(0xFF64748B),
        value: 'Status izin belum dapat diperiksa.',
      );
    }
    if (_schedulingFailed) {
      return (
        icon: Icons.warning_amber_rounded,
        color: AppTheme.red,
        value:
            'Sebagian pengingat belum bisa dijadwalkan. Jadwalkan ulang, '
            'lalu periksa izin alarm.',
      );
    }
    if (_pendingError != null) {
      // The plugin could not enumerate alarms, but scheduling itself did not
      // fail. Do not turn an unreadable diagnostic into a scary error.
      return (
        icon: Icons.check_circle_rounded,
        color: AppTheme.teal,
        value: 'Pengingat obat sudah diproses di perangkat ini.',
      );
    }
    if (_pendingCount == 0) {
      return (
        icon: Icons.info_rounded,
        color: AppTheme.yellow,
        value: 'Belum ada jadwal pengingat.',
      );
    }
    return (
      icon: Icons.check_circle_rounded,
      color: AppTheme.teal,
      value: 'Anda akan diingatkan sesuai jadwal dari petugas.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final reminder = _reminderStatus;

    return DraggableScrollableSheet(
      initialChildSize: 0.72,
      maxChildSize: 0.92,
      minChildSize: 0.5,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: Column(
            children: [
              Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(top: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFFCBD5E1),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
                child: Row(
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
                        'Pengaturan Notifikasi',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF1E293B),
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: _busy ? null : _refresh,
                      icon: const Icon(Icons.refresh_rounded),
                      tooltip: 'Perbarui status',
                    ),
                  ],
                ),
              ),
              Expanded(
                child: _loading
                    ? const Center(child: CircularProgressIndicator())
                    : _error != null
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.error_outline_rounded,
                                color: AppTheme.red,
                                size: 36,
                              ),
                              const SizedBox(height: 12),
                              Text(
                                _error!,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  fontSize: 13,
                                  color: Color(0xFF475569),
                                  height: 1.5,
                                ),
                              ),
                              const SizedBox(height: 16),
                              OutlinedButton.icon(
                                onPressed: _refresh,
                                icon: const Icon(
                                  Icons.refresh_rounded,
                                  size: 18,
                                ),
                                label: const Text('Coba Lagi'),
                              ),
                            ],
                          ),
                        ),
                      )
                    : ListView(
                        controller: scrollController,
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                        children: [
                          _statusRow(
                            icon: reminder.icon,
                            color: reminder.color,
                            label: 'Pengingat obat',
                            value: reminder.value,
                          ),
                          if (_exactAlarms == false)
                            _statusRow(
                              icon: Icons.schedule_rounded,
                              color: AppTheme.yellow,
                              label: 'Ketepatan waktu',
                              value: 'Bisa sedikit terlambat.',
                            ),
                          if (_notificationsError != null)
                            _unknownRow(
                              'Izin notifikasi',
                              _notificationsError!,
                            ),
                          if (_exactAlarmsError != null)
                            _unknownRow('Izin alarm', _exactAlarmsError!),
                          if (_notificationsError != null ||
                              _exactAlarmsError != null) ...[
                            const SizedBox(height: 4),
                            OutlinedButton.icon(
                              onPressed: _refresh,
                              icon: const Icon(Icons.refresh_rounded, size: 18),
                              label: const Text('Coba Lagi'),
                            ),
                          ],
                          const SizedBox(height: 12),
                          Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: const Color(0xFFF8FAFC),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: const Color(0xFFE2E8F0),
                              ),
                            ),
                            child: const Text(
                              'Jika notifikasi atau suara tidak muncul, matikan '
                              'mode Senyap/Jangan Ganggu, naikkan volume '
                              'notifikasi, lalu periksa izin di Pengaturan '
                              'Android > Aplikasi > Dinar-TB > Notifikasi.',
                              style: TextStyle(
                                fontSize: 12.5,
                                color: Color(0xFF475569),
                                height: 1.5,
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          if (_notificationsEnabled == false)
                            _actionButton(
                              icon: Icons.notifications_active_rounded,
                              label: 'Izinkan Notifikasi',
                              onPressed: _enableNotifications,
                            ),
                          if (_exactAlarms == false)
                            _actionButton(
                              icon: Icons.alarm_on_rounded,
                              label: 'Izinkan Alarm Tepat Waktu',
                              onPressed: _requestExactAlarm,
                            ),
                          if (_schedulingFailed)
                            _actionButton(
                              icon: Icons.refresh_rounded,
                              label: 'Jadwalkan Ulang Pengingat',
                              onPressed: _rescheduleReminders,
                            ),
                          _actionButton(
                            icon: Icons.settings_rounded,
                            label: 'Buka Pengaturan Aplikasi',
                            onPressed: _openAppSettings,
                          ),
                          if (widget.showTestTools) ...[
                            _actionButton(
                              icon: Icons.notifications_active_rounded,
                              label: 'Kirim Notifikasi Uji Sekarang',
                              onPressed: _sendTestNotification,
                            ),
                            _actionButton(
                              icon: Icons.schedule_rounded,
                              label: 'Uji Notifikasi Terjadwal 1 Menit',
                              onPressed: _scheduleTestNotification,
                            ),
                          ],
                        ],
                      ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _statusRow({
    required IconData icon,
    required Color color,
    required String label,
    required String value,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF1E293B),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 12.5,
                    color: Color(0xFF64748B),
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _unknownRow(String label, String reason) {
    return _statusRow(
      icon: Icons.help_outline_rounded,
      color: const Color(0xFF64748B),
      label: label,
      value: '$reason. Ketuk perbarui untuk mencoba lagi.',
    );
  }

  Widget _actionButton({
    required IconData icon,
    required String label,
    required Future<void> Function() onPressed,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: SizedBox(
        width: double.infinity,
        child: OutlinedButton.icon(
          onPressed: _busy ? null : () => onPressed(),
          icon: Icon(icon, size: 18),
          label: Text(label),
          style: OutlinedButton.styleFrom(
            foregroundColor: AppTheme.primaryBlue,
            side: BorderSide(
              color: AppTheme.primaryBlue.withValues(alpha: 0.4),
            ),
            padding: const EdgeInsets.symmetric(vertical: 12),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
      ),
    );
  }
}
