import 'package:flutter_test/flutter_test.dart';
import 'package:dinar_tb_patient/models/models.dart';
import 'package:dinar_tb_patient/services/reminder_maintenance.dart';

Patient _patient({DateTime? archivedAt}) => Patient(
  id: 'patient-1',
  fullName: 'Pasien Uji',
  registerNumber: 'TB-001',
  address: 'Jakarta',
  version: 1,
  archivedAt: archivedAt,
);

TreatmentCourse _treatment({
  DateTime? completedAt,
  bool remindersEnabled = true,
}) => TreatmentCourse(
  id: 'treatment-1',
  patientId: 'patient-1',
  startDate: '2026-10-01',
  initialTargetEndDate: '2027-01-01',
  completedAt: completedAt,
  version: 1,
  reviewDue: false,
  remindersEnabled: remindersEnabled,
);

void main() {
  group('maintenance eligibility', () {
    test('runs for an active patient with an active course', () {
      expect(
        shouldMaintainReminderSchedule(
          patient: _patient(),
          treatments: [_treatment()],
        ),
        isTrue,
      );
    });

    test('does nothing for an archived patient', () {
      expect(
        shouldMaintainReminderSchedule(
          patient: _patient(archivedAt: DateTime.utc(2026, 10, 20)),
          treatments: [_treatment()],
        ),
        isFalse,
      );
    });

    test('does nothing without local patient data', () {
      expect(
        shouldMaintainReminderSchedule(
          patient: null,
          treatments: [_treatment()],
        ),
        isFalse,
      );
    });

    test('does nothing for a completed or disabled course', () {
      expect(
        shouldMaintainReminderSchedule(
          patient: _patient(),
          treatments: [_treatment(completedAt: DateTime.utc(2026, 10, 20))],
        ),
        isFalse,
      );
      expect(
        shouldMaintainReminderSchedule(
          patient: _patient(),
          treatments: [_treatment(remindersEnabled: false)],
        ),
        isFalse,
      );
    });

    test('keeps running while any course is still active', () {
      expect(
        shouldMaintainReminderSchedule(
          patient: _patient(),
          treatments: [
            _treatment(completedAt: DateTime.utc(2026, 10, 20)),
            _treatment(),
          ],
        ),
        isTrue,
      );
    });
  });

  test('the weekly task runs well before the 60-day horizon', () {
    expect(reminderMaintenanceFrequency.inDays, lessThan(60));
    expect(reminderMaintenanceFrequency.inDays, lessThanOrEqualTo(14));
  });
}
