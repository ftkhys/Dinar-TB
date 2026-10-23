import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:dinar_tb_patient/models/models.dart';
import 'package:dinar_tb_patient/services/hive_setup.dart';

void main() {
  late Directory tempDir;

  setUpAll(() async {
    tempDir = await Directory.systemTemp.createTemp('dinar_hive_adapters');
    Hive.init(tempDir.path);
  });

  tearDownAll(() async {
    await Hive.close();
    await tempDir.delete(recursive: true);
  });

  test(
    'production registration includes the nested adherence status adapter',
    () async {
      registerHiveAdapters();

      expect(
        Hive.isAdapterRegistered(AdherenceOperationAdapter().typeId),
        isTrue,
      );
      expect(
        Hive.isAdapterRegistered(AdherenceOperationStatusAdapter().typeId),
        isTrue,
        reason:
            'writing an AdherenceOperation needs the status enum adapter too; '
            'registering only the box value type throws at runtime',
      );

      final box = await Hive.openBox<AdherenceOperation>('adherence_queue');
      final operation = AdherenceOperation(
        operationId: 'op-registration',
        treatmentCourseId: 'treatment-1',
        adherenceDate: '2026-10-19',
        confirmedAt: '2026-10-19T01:00:00.000Z',
        expectedTreatmentVersion: 1,
        createdAt: DateTime.utc(2026, 10, 19, 1),
      );

      await box.put(operation.operationId, operation);
      final loaded = box.get(operation.operationId)!;

      expect(loaded.status, AdherenceOperationStatus.pending);
      expect(loaded.adherenceDate, '2026-10-19');
      await box.close();
    },
  );

  test('registration is idempotent', () {
    expect(registerHiveAdapters, returnsNormally);
    expect(registerHiveAdapters, returnsNormally);
  });
}
