import 'package:flutter/material.dart';
import 'package:dinar_tb_patient/theme/app_theme.dart';
import 'package:dinar_tb_patient/widgets/patient_app_bar.dart';
import 'package:dinar_tb_patient/widgets/sync_status_banner.dart';
import 'package:dinar_tb_patient/models/models.dart';
import 'package:dinar_tb_patient/repositories/schedule_repository.dart';
import 'package:dinar_tb_patient/services/sync_service.dart';
import 'package:dinar_tb_patient/utils/indo_date.dart';

class JadwalScreen extends StatelessWidget {
  final ScheduleRepository repository;
  final SyncService syncService;

  const JadwalScreen({
    super.key,
    required this.repository,
    required this.syncService,
  });

  ControlSchedule? get _activeSchedule => repository.getCurrentSchedule();

  @override
  Widget build(BuildContext context) {
    final schedule = _activeSchedule;
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
            title: 'Jadwal Kontrol',
            showBack: false,
            showNotification: false,
          ),
          expandedHeight: 0,
        ),
        SliverToBoxAdapter(
          child: Column(
            children: [
              SyncStatusBanner(
                status: syncService.syncStatus,
                onRetry: () => syncService.forceSync(),
              ),
              if (schedule == null)
                _buildEmptyState()
              else ...[
                _buildControlHero(schedule),
                _buildInfoStrip(schedule),
                _buildPreparationChecklist(),
                _buildVisitHistory(),
                _buildReadonlyNote(),
              ],
              const SizedBox(height: 100),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildEmptyState() {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 32, 16, 16),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        children: [
          const Icon(
            Icons.calendar_today_rounded,
            size: 48,
            color: AppTheme.primaryBlue,
          ),
          const SizedBox(height: 16),
          const Text(
            'Belum ada jadwal kontrol',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: Color(0xFF1E293B),
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          const Text(
            'Jadwal kontrol akan muncul setelah data disinkronkan.',
            style: TextStyle(fontSize: 13, color: Color(0xFF64748B)),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildControlHero(ControlSchedule schedule) {
    final scheduledDate = IndoDate.parseDateOnly(schedule.scheduledDate);
    final today = IndoDate.nowJakarta();
    final clinicName = repository.getClinicName();
    final clinicPhone = repository.getClinicPhone();

    if (scheduledDate == null) {
      return const SizedBox.shrink();
    }

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 8),
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
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFFEEF2FF),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.calendar_today_rounded,
                  size: 18,
                  color: AppTheme.primaryBlue,
                ),
              ),
              const SizedBox(width: 10),
              const Text(
                'Kontrol berikutnya',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF475569),
                ),
              ),
              const Spacer(),
              if (schedule.overriddenAt != null)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.yellow.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text(
                    'Diperbarui petugas',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF92400E),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: AppTheme.primaryBlue,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      IndoDate.bulanSingkat(scheduledDate),
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                        letterSpacing: 0.5,
                      ),
                    ),
                    Text(
                      '${scheduledDate.day}',
                      style: const TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      IndoDate.lengkap(scheduledDate),
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF1E293B),
                      ),
                    ),
                    const SizedBox(height: 4),
                    if (clinicName != null)
                      Row(
                        children: [
                          const Icon(
                            Icons.location_on_rounded,
                            size: 15,
                            color: AppTheme.primaryBlue,
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              clinicName,
                              style: const TextStyle(
                                fontSize: 13,
                                color: Color(0xFF475569),
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    if (clinicPhone != null && clinicPhone.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(
                            Icons.phone_rounded,
                            size: 15,
                            color: AppTheme.primaryBlue,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            clinicPhone,
                            style: const TextStyle(
                              fontSize: 13,
                              color: Color(0xFF475569),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: AppTheme.primaryBlue.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.schedule_rounded,
                  size: 16,
                  color: AppTheme.primaryBlue,
                ),
                const SizedBox(width: 6),
                Text(
                  IndoDate.labelSelisih(scheduledDate, today),
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.primaryBlue,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoStrip(ControlSchedule schedule) {
    final text = schedule.overriddenAt != null
        ? 'Jadwal ini diperbarui petugas. Hubungi petugas jika Anda berhalangan hadir.'
        : 'Waktu kunjungan mengikuti jam layanan Puskesmas. Hubungi petugas jika Anda berhalangan hadir.';
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFEEF2FF),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.primaryBlue.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.info_outline_rounded,
            color: AppTheme.primaryBlue,
            size: 22,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 12,
                color: Color(0xFF334155),
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPreparationChecklist() {
    const items = [
      'Kartu berobat pasien',
      'Obat yang masih tersisa',
      'Catatan keluhan, jika ada',
    ];

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
            'Yang perlu disiapkan',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: Color(0xFF1E293B),
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Sebelum datang ke Puskesmas',
            style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
          ),
          const SizedBox(height: 16),
          ...items.map(
            (item) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                children: [
                  Container(
                    width: 22,
                    height: 22,
                    decoration: BoxDecoration(
                      color: AppTheme.green,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Icon(
                      Icons.check_rounded,
                      size: 14,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      item,
                      style: const TextStyle(
                        fontSize: 14,
                        color: Color(0xFF334155),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVisitHistory() {
    final visits = repository.getAllVisits();

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
            'Riwayat Kontrol',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: Color(0xFF1E293B),
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Kunjungan sebelumnya',
            style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
          ),
          const SizedBox(height: 16),
          if (visits.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text(
                'Belum ada riwayat kontrol tercatat.',
                style: TextStyle(fontSize: 13, color: Color(0xFF64748B)),
              ),
            )
          else
            ...visits.asMap().entries.map((entry) {
              final index = entry.key;
              final visit = entry.value;
              final date = IndoDate.parseDateOnly(visit.visitDate);
              final subtitle = visit.medicineGiven
                  ? 'Obat diberikan oleh petugas'
                  : 'Kontrol tanpa obat';
              return Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Column(
                      children: [
                        Container(
                          width: 10,
                          height: 10,
                          decoration: BoxDecoration(
                            color: index == 0
                                ? AppTheme.primaryBlue
                                : const Color(0xFFCBD5E1),
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 2),
                          ),
                        ),
                        if (index < visits.length - 1)
                          Container(
                            width: 1,
                            height: 40,
                            margin: const EdgeInsets.only(top: 4),
                            color: const Color(0xFFE2E8F0),
                          ),
                      ],
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            date == null
                                ? visit.visitDate
                                : IndoDate.lengkap(date),
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFF1E293B),
                            ),
                          ),
                          const SizedBox(height: 2),
                          const Text(
                            'Kontrol selesai',
                            style: TextStyle(
                              fontSize: 13,
                              color: Color(0xFF475569),
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            subtitle,
                            style: const TextStyle(
                              fontSize: 12,
                              color: Color(0xFF94A3B8),
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (index == 0)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: AppTheme.green.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Text(
                          'Terbaru',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.green,
                          ),
                        ),
                      ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _buildReadonlyNote() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        children: const [
          Icon(Icons.lock_rounded, size: 19, color: Color(0xFF94A3B8)),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              'Jadwal kontrol ditetapkan oleh petugas kesehatan dan tidak dapat diubah melalui aplikasi.',
              style: TextStyle(
                fontSize: 12,
                color: Color(0xFF64748B),
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
