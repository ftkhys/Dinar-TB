import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:dinar_tb_patient/models/models.dart';

void main() {
  late Directory tempDir;

  setUpAll(() async {
    tempDir = await Directory.systemTemp.createTemp('dinar_hive_test');
    Hive.init(tempDir.path);
    Hive.registerAdapter(PatientAdapter());
    Hive.registerAdapter(AdherenceHistoryAdapter());
    Hive.registerAdapter(AdherenceDayAdapter());
    Hive.registerAdapter(AdherenceOperationAdapter());
    Hive.registerAdapter(AdherenceOperationStatusAdapter());
    Hive.registerAdapter(VisitRecordAdapter());
  });

  tearDownAll(() async {
    await Hive.close();
    await tempDir.delete(recursive: true);
  });

  test('patient archived status survives JSON and Hive persistence', () async {
    final archivedAt = DateTime.utc(2026, 10, 20, 8, 30);
    final patient = Patient(
      id: 'patient-1',
      fullName: 'Pasien Uji',
      registerNumber: 'TB-001',
      address: 'Jakarta',
      version: 2,
      archivedAt: archivedAt,
    );

    final fromJson = Patient.fromJson({
      'id': 'patient-1',
      'fullName': 'Pasien Uji',
      'registerNumber': 'TB-001',
      'address': 'Jakarta',
      'version': 2,
      'archivedAt': archivedAt.toIso8601String(),
    });
    expect(fromJson.isArchived, isTrue);
    expect(fromJson.archivedAt, archivedAt);
    expect(patient.toJson()['archivedAt'], archivedAt.toIso8601String());

    final box = await Hive.openBox<Patient>('patient_archive_test');
    await box.put(patient.id, patient);
    await box.close();

    final reopened = await Hive.openBox<Patient>('patient_archive_test');
    final loaded = reopened.get('patient-1')!;
    expect(loaded.isArchived, isTrue);
    expect(loaded.archivedAt, archivedAt);
    await reopened.close();
  });

  test('an active patient has no archive timestamp', () {
    final active = Patient.fromJson({
      'id': 'patient-2',
      'fullName': 'Pasien Aktif',
      'registerNumber': 'TB-002',
      'address': 'Jakarta',
      'version': 1,
      'archivedAt': null,
    });

    expect(active.isArchived, isFalse);
    expect(active.archivedAt, isNull);
  });

  test('D10: adherence history can be saved, closed and reopened', () async {
    final history = AdherenceHistory(
      treatmentCourseId: 'treatment-1',
      days: [
        AdherenceDay(
          date: '2026-10-01',
          status: 'TAKEN',
          confirmedAt: '2026-10-01T06:30:00.000Z',
        ),
        AdherenceDay(date: '2026-10-02', status: 'MISSED'),
      ],
      totalTaken: 1,
      totalMissed: 1,
      missedStreak: 1,
    );

    final box = await Hive.openBox<AdherenceHistory>('adherence_history_test');
    await box.put('treatment-1', history);
    await box.close();

    final reopened = await Hive.openBox<AdherenceHistory>(
      'adherence_history_test',
    );
    final loaded = reopened.get('treatment-1')!;
    expect(loaded.days.length, 2);
    expect(loaded.days.first.status, 'TAKEN');
    expect(loaded.days.first.confirmedAt, '2026-10-01T06:30:00.000Z');
    expect(loaded.days[1].status, 'MISSED');
    expect(loaded.totalTaken, 1);
    expect(loaded.missedStreak, 1);
    await reopened.close();
  });

  test('D6: the offline adherence queue survives an app restart', () async {
    final operation = AdherenceOperation(
      operationId: 'op-1',
      treatmentCourseId: 'treatment-1',
      adherenceDate: '2026-10-05',
      confirmedAt: '2026-10-05T07:00:00.000Z',
      expectedTreatmentVersion: 1,
      createdAt: DateTime.utc(2026, 10, 5, 7),
    );

    final box = await Hive.openBox<AdherenceOperation>('adherence_queue_test');
    await box.put(operation.operationId, operation);
    await box.close();

    final reopened = await Hive.openBox<AdherenceOperation>(
      'adherence_queue_test',
    );
    final loaded = reopened.get('op-1')!;
    expect(loaded.status, AdherenceOperationStatus.pending);
    expect(loaded.adherenceDate, '2026-10-05');
    expect(loaded.treatmentCourseId, 'treatment-1');
    expect(reopened.values.length, 1);
    await reopened.close();
  });

  test('control visits persist with all fields intact', () async {
    final visit = VisitRecord(
      id: 'visit-1',
      visitDate: '2026-10-10',
      medicineGiven: true,
      medicationGivenOn: '2026-10-10',
      complaintProgress: 'Batuk berkurang',
      additionalNote: 'Lanjut obat',
    );

    final box = await Hive.openBox<VisitRecord>('visits_test');
    await box.put(visit.id, visit);
    await box.close();

    final reopened = await Hive.openBox<VisitRecord>('visits_test');
    final loaded = reopened.get('visit-1')!;
    expect(loaded.visitDate, '2026-10-10');
    expect(loaded.medicineGiven, isTrue);
    expect(loaded.medicationGivenOn, '2026-10-10');
    expect(loaded.complaintProgress, 'Batuk berkurang');
    expect(loaded.additionalNote, 'Lanjut obat');
    await reopened.close();
  });
}
