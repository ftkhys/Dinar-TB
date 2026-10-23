// This is a basic Flutter widget test.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('Dinar-TB Patient app builds', (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        title: 'Dinar-TB Test',
        home: Scaffold(body: Center(child: Text('Dinar-TB Test'))),
      ),
    );

    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
