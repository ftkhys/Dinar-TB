import 'package:flutter/material.dart';
import 'package:dinar_tb_patient/theme/app_theme.dart';
import 'package:dinar_tb_patient/widgets/patient_app_bar.dart';
import 'package:dinar_tb_patient/widgets/sync_status_banner.dart';
import 'package:dinar_tb_patient/models/models.dart';
import 'package:dinar_tb_patient/repositories/schedule_repository.dart';
import 'package:dinar_tb_patient/services/notification_service.dart';
import 'package:dinar_tb_patient/services/sync_service.dart';
import 'package:dinar_tb_patient/utils/indo_date.dart';

class PerkembanganScreen extends StatelessWidget {
  final ScheduleRepository repository;
  final SyncService syncService;
  final NotificationService notificationService;

  const PerkembanganScreen({
    super.key,
    required this.repository,
    required this.syncService,
    required this.notificationService,
  });

  TreatmentCourse? get _treatment => repository.getCurrentTreatment();

  @override
  Widget build(BuildContext context) {
    final treatment = _treatment;
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
            title: 'Perkembangan',
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
              if (treatment == null)
                _buildEmpty()
              else ...[
                _buildStageCard(treatment),
                if (treatment.isCompleted) _buildCompletionMessage(treatment),
                const SizedBox(height: 4),
                _buildDisclaimer(),
                _buildWeeklyConfirmation(treatment),
                _buildMetrics(treatment),
                _buildMilestones(treatment),
                _buildMedicalNote(),
              ],
              const SizedBox(height: 100),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildEmpty() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 64),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: const Color(0xFFF1F5F9),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.monitor_heart_outlined,
              color: Color(0xFF94A3B8),
              size: 34,
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'Data pengobatan belum tersedia',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: Color(0xFF1E293B),
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Data akan muncul setelah tersinkron dari server.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: Color(0xFF64748B)),
          ),
        ],
      ),
    );
  }

  Widget _buildStageCard(TreatmentCourse treatment) {
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

    final completed = treatment.isCompleted;

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
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Tahap pengobatan saat ini',
                      style: TextStyle(fontSize: 13, color: Color(0xFF64748B)),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      completed
                          ? 'Pengobatan selesai'
                          : (totalBulan > 0
                                ? 'Bulan ke-$bulanKe'
                                : 'Sedang berjalan'),
                      style: const TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF1E293B),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      completed
                          ? (treatment.finalDecision ??
                                'Sesuai catatan petugas')
                          : (totalBulan > 0
                                ? 'Dari rencana $totalBulan bulan'
                                : 'Menunggu data petugas'),
                      style: const TextStyle(
                        fontSize: 13,
                        color: Color(0xFF94A3B8),
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                width: 70,
                height: 70,
                decoration: BoxDecoration(
                  color: AppTheme.primaryBlue.withValues(alpha: 0.08),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Text(
                    '${(fraction * 100).round()}%',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.primaryBlue,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
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
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Mulai',
                      style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      start == null ? '-' : IndoDate.medium(start),
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF1E293B),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      totalBulan > 0
                          ? 'Rencana $totalBulan bulan*'
                          : 'Rencana*',
                      style: const TextStyle(
                        fontSize: 11,
                        color: Color(0xFF94A3B8),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      end == null ? '-' : IndoDate.medium(end),
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF1E293B),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCompletionMessage(TreatmentCourse treatment) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.green.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.green.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.check_circle_rounded,
            color: AppTheme.green,
            size: 22,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  treatment.displayMessage ?? 'Pengobatan selesai',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF1E293B),
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Terima kasih telah menyelesaikan pengobatan dan mengikuti '
                  'arahan petugas. Tetap jaga kesehatan dan ikuti kontrol '
                  'lanjutan bila petugas menyarankannya.',
                  style: TextStyle(
                    fontSize: 12,
                    color: Color(0xFF475569),
                    height: 1.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDisclaimer() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF7ED),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppTheme.yellow.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          Icon(Icons.info_outline_rounded, size: 16, color: AppTheme.yellow),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              '*Durasi mengikuti catatan petugas kesehatan dan dapat berubah sesuai evaluasi klinis.',
              style: TextStyle(
                fontSize: 11,
                color: Color(0xFF78350F),
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildWeeklyConfirmation(TreatmentCourse treatment) {
    final adherence = notificationService.historyWithToday(
      repository.getAdherenceHistory(treatment.id),
      treatmentId: treatment.id,
    );
    final statusByDate = <String, String>{};
    if (adherence != null) {
      for (final day in adherence.days) {
        statusByDate[day.date] = day.status;
      }
    }

    final today = IndoDate.nowJakarta();
    final todayDate = DateTime(today.year, today.month, today.day);
    final monday = todayDate.subtract(Duration(days: today.weekday - 1));
    final weekDates = List.generate(7, (i) => monday.add(Duration(days: i)));

    String keyOf(DateTime d) =>
        '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

    int doneCount = 0;
    final cells = weekDates.map((d) {
      final status = statusByDate[keyOf(d)];
      final isFuture = d.isAfter(todayDate);
      final isToday = d == todayDate;
      final done = status == 'Sudah diminum';
      if (done) doneCount++;
      return _WeekCell(
        label: IndoDate.hari(d).substring(0, 1),
        done: done,
        isToday: isToday,
        isFuture: isFuture,
      );
    }).toList();

    final weekStart = IndoDate.medium(weekDates.first);
    final weekEnd = IndoDate.medium(weekDates.last);

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
          Row(
            children: [
              const Text(
                'Konfirmasi Minggu Ini',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF1E293B),
                ),
              ),
              const Spacer(),
              Text(
                '$weekStart – $weekEnd',
                style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Text(
                '$doneCount/7',
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.primaryBlue,
                ),
              ),
              const SizedBox(width: 12),
              const Text(
                'hari',
                style: TextStyle(fontSize: 14, color: Color(0xFF64748B)),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: cells.map((c) => Flexible(child: c)).toList(),
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF7ED),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppTheme.yellow.withValues(alpha: 0.3)),
            ),
            child: Row(
              children: const [
                Icon(
                  Icons.warning_amber_rounded,
                  size: 18,
                  color: AppTheme.yellow,
                ),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Hari tanpa konfirmasi di aplikasi bukan penilaian medis.',
                    style: TextStyle(
                      fontSize: 11,
                      color: Color(0xFF78350F),
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMetrics(TreatmentCourse treatment) {
    final adherence = notificationService.historyWithToday(
      repository.getAdherenceHistory(treatment.id),
      treatmentId: treatment.id,
    );
    final visits = repository.getAllVisits();

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        children: [
          Expanded(
            child: _buildMetricItem(
              Icons.check_circle_rounded,
              AppTheme.green,
              '${adherence?.totalTaken ?? 0} hari',
              'Terkonfirmasi sejak mulai',
            ),
          ),
          Container(width: 1, height: 50, color: const Color(0xFFE2E8F0)),
          Expanded(
            child: _buildMetricItem(
              Icons.calendar_today_rounded,
              AppTheme.primaryBlue,
              '${visits.length} kali',
              'Kontrol tercatat',
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMetricItem(
    IconData icon,
    Color color,
    String value,
    String label,
  ) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Icon(icon, size: 18, color: color),
              const SizedBox(width: 6),
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

  Widget _buildMilestones(TreatmentCourse treatment) {
    final start = IndoDate.parseDateOnly(treatment.startDate);
    final visits = repository.getAllVisits();

    final milestones = <MapEntry<DateTime, List<String>>>[];
    for (final visit in visits) {
      final date = IndoDate.parseDateOnly(visit.visitDate);
      if (date == null) continue;
      final subtitle = visit.medicineGiven
          ? 'Obat diberikan oleh petugas'
          : 'Kontrol tanpa obat';
      milestones.add(MapEntry(date, ['Kontrol rutin selesai', subtitle]));
    }
    if (start != null) {
      milestones.add(
        MapEntry(start, ['Pengobatan dimulai', 'Data dicatat di Puskesmas']),
      );
    }
    milestones.sort((a, b) => b.key.compareTo(a.key));

    if (milestones.isEmpty) return const SizedBox.shrink();

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
            'Perjalanan Pengobatan',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: Color(0xFF1E293B),
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Catatan penting terverifikasi',
            style: TextStyle(
              fontSize: 12,
              color: Color(0xFF94A3B8),
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 20),
          ...milestones.asMap().entries.map((entry) {
            final index = entry.key;
            final date = entry.value.key;
            final milestone = entry.value.value;
            return Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Column(
                    children: [
                      Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(
                          color: AppTheme.primaryBlue,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 3),
                        ),
                      ),
                      if (index < milestones.length - 1)
                        Container(
                          width: 1,
                          height: 48,
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
                          IndoDate.medium(date),
                          style: const TextStyle(
                            fontSize: 12,
                            color: Color(0xFF94A3B8),
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          milestone[0],
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF1E293B),
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          milestone[1],
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
            );
          }),
        ],
      ),
    );
  }

  Widget _buildMedicalNote() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF3C7),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.yellow.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          Icon(Icons.warning_amber_rounded, size: 19, color: AppTheme.yellow),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              'Aplikasi membantu mencatat perkembangan, tetapi tidak menentukan kesembuhan. Ikuti arahan petugas kesehatan.',
              style: TextStyle(
                fontSize: 12,
                color: Color(0xFF78350F),
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _WeekCell extends StatelessWidget {
  final String label;
  final bool done;
  final bool isToday;
  final bool isFuture;

  const _WeekCell({
    required this.label,
    required this.done,
    required this.isToday,
    required this.isFuture,
  });

  @override
  Widget build(BuildContext context) {
    final Color bg;
    final Color border;
    if (done) {
      bg = AppTheme.green.withValues(alpha: 0.1);
      border = AppTheme.green.withValues(alpha: 0.3);
    } else if (isFuture) {
      bg = const Color(0xFFF8FAFC);
      border = const Color(0xFFE2E8F0);
    } else {
      bg = const Color(0xFFF1F5F9);
      border = const Color(0xFFE2E8F0);
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: isToday ? AppTheme.primaryBlue : border,
              width: isToday ? 1.5 : 1,
            ),
          ),
          child: Center(
            child: done
                ? const Icon(
                    Icons.check_rounded,
                    size: 18,
                    color: AppTheme.green,
                  )
                : Text(
                    '—',
                    style: TextStyle(
                      fontSize: 14,
                      color: isFuture
                          ? const Color(0xFFCBD5E1)
                          : const Color(0xFF94A3B8),
                    ),
                  ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: done || isToday ? FontWeight.w600 : FontWeight.w400,
            color: done || isToday
                ? const Color(0xFF1E293B)
                : const Color(0xFF94A3B8),
          ),
          overflow: TextOverflow.ellipsis,
        ),
      ],
    );
  }
}
