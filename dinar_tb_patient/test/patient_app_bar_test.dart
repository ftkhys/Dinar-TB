import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dinar_tb_patient/widgets/patient_app_bar.dart';

void main() {
  Future<AppBar> pumpHeader(
    WidgetTester tester, {
    bool showBack = false,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          appBar: PatientAppBar(showBack: showBack, showNotification: false),
        ),
      ),
    );
    return tester.widget<AppBar>(find.byType(AppBar));
  }

  testWidgets('logo headers use the tighter title gap', (tester) async {
    final appBar = await pumpHeader(tester);

    expect(appBar.titleSpacing, 8);
  });

  testWidgets('back-button headers keep their previous spacing', (
    tester,
  ) async {
    final appBar = await pumpHeader(tester, showBack: true);

    expect(appBar.titleSpacing, 16);
  });
}
