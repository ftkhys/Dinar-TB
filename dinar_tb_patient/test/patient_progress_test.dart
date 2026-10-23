import 'package:flutter_test/flutter_test.dart';
import 'package:dinar_tb_patient/models/models.dart';
import 'package:dinar_tb_patient/utils/indo_date.dart';

void main() {
  group('PatientProgress.fromJson', () {
    test('parses treatment, visits and adherence summary', () {
      final progress = PatientProgress.fromJson({
        'treatment': {
          'id': 'treatment-1',
          'startDate': '2026-07-12',
          'initialTargetEndDate': '2027-01-12',
          'continuedTargetEndDate': null,
          'completedAt': null,
          'finalDecision': null,
          'finalReviewNote': null,
          'finalReviewedAt': null,
        },
        'visits': [
          {
            'id': 'visit-1',
            'visitDate': '2026-09-25',
            'medicineGiven': true,
            'medicationGivenOn': '2026-09-25',
            'complaintProgress': null,
            'additionalNote': null,
          },
        ],
        'adherence': {
          'days': [
            {
              'date': '2026-09-25',
              'status': 'Sudah diminum',
              'confirmedAt': null,
            },
          ],
          'totalTaken': 1,
          'totalMissed': 0,
          'missedStreak': 0,
        },
        'serverTime': '2026-10-17T00:00:00.000Z',
      });

      expect(progress.treatment?.id, 'treatment-1');
      expect(progress.visits.single.id, 'visit-1');
      expect(progress.visits.single.medicineGiven, isTrue);
      expect(progress.adherence?.totalTaken, 1);
      expect(progress.serverTime, '2026-10-17T00:00:00.000Z');
    });

    test('tolerates a missing treatment and empty visits', () {
      final progress = PatientProgress.fromJson({
        'treatment': null,
        'visits': <dynamic>[],
        'adherence': null,
        'serverTime': '2026-10-17T00:00:00.000Z',
      });

      expect(progress.treatment, isNull);
      expect(progress.visits, isEmpty);
      expect(progress.adherence, isNull);
    });
  });

  group('IndoDate', () {
    test('formats Indonesian day, month and full date', () {
      final date = DateTime(2026, 10, 10);
      expect(IndoDate.hari(date), 'Sabtu');
      expect(IndoDate.bulanSingkat(date), 'OKT');
      expect(IndoDate.lengkap(date), 'Sabtu, 10 Oktober 2026');
      expect(IndoDate.jamMenit(DateTime(2026, 10, 10, 7, 12)), '07.12');
    });

    test('labels relative days', () {
      final today = DateTime(2026, 10, 10);
      expect(IndoDate.labelSelisih(DateTime(2026, 10, 10), today), 'Hari ini');
      expect(IndoDate.labelSelisih(DateTime(2026, 10, 11), today), 'Besok');
      expect(
        IndoDate.labelSelisih(DateTime(2026, 10, 15), today),
        '5 hari lagi',
      );
    });
  });
}
