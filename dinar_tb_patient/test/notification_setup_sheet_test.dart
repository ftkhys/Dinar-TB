// The one-time permission onboarding must explain the request, never claim a
// permission is active before it really is, and re-read the OS state after the
// patient returns from a system settings screen.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';

import 'package:dinar_tb_patient/widgets/notification_setup_sheet.dart';

import 'sync_service_retry_test.mocks.dart';

Widget _host(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  late MockNotificationService service;

  setUp(() {
    service = MockNotificationService();
  });

  testWidgets('shows both permissions as inactive before they are granted', (
    tester,
  ) async {
    when(service.areNotificationsEnabled()).thenAnswer((_) async => false);
    when(service.canScheduleExactAlarms()).thenAnswer((_) async => false);

    await tester.pumpWidget(
      _host(NotificationSetupSheet(notificationService: service)),
    );
    await tester.pumpAndSettle();

    expect(find.text('Notifikasi'), findsOneWidget);
    expect(find.text('Alarm tepat waktu'), findsOneWidget);
    expect(find.text('Belum aktif'), findsNWidgets(2));
    expect(find.text('Aktif'), findsNothing);
    expect(find.text('Izinkan Notifikasi'), findsOneWidget);
    expect(find.text('Izinkan Alarm Tepat Waktu'), findsOneWidget);
    expect(find.text('Atur Nanti'), findsOneWidget);
  });

  testWidgets('notification permission is reflected after the system prompt', (
    tester,
  ) async {
    var enabled = false;
    when(service.areNotificationsEnabled()).thenAnswer((_) async => enabled);
    when(service.canScheduleExactAlarms()).thenAnswer((_) async => false);
    when(service.requestPermission()).thenAnswer((_) async {
      enabled = true;
      return true;
    });

    await tester.pumpWidget(
      _host(NotificationSetupSheet(notificationService: service)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Izinkan Notifikasi'));
    await tester.pumpAndSettle();

    expect(find.text('Izinkan Notifikasi'), findsNothing);
    expect(find.text('Aktif'), findsOneWidget);
    expect(find.text('Belum aktif'), findsOneWidget);
  });

  testWidgets('exact-alarm grant re-registers alarms and completes setup', (
    tester,
  ) async {
    var exact = false;
    when(service.areNotificationsEnabled()).thenAnswer((_) async => true);
    when(service.canScheduleExactAlarms()).thenAnswer((_) async => exact);
    when(service.requestExactAlarmPermission()).thenAnswer((_) async {
      exact = true;
      return true;
    });
    when(service.refreshRoutineReminders(force: true)).thenAnswer((_) async {});

    await tester.pumpWidget(
      _host(NotificationSetupSheet(notificationService: service)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Izinkan Alarm Tepat Waktu'));
    await tester.pumpAndSettle();

    verify(service.refreshRoutineReminders(force: true)).called(1);
    expect(find.text('Pengingat siap digunakan.'), findsOneWidget);
    expect(find.text('Selesai'), findsOneWidget);
    expect(find.text('Izinkan Alarm Tepat Waktu'), findsNothing);
  });

  testWidgets('re-reads permissions when returning from system settings', (
    tester,
  ) async {
    var notifications = false;
    var exact = false;
    when(
      service.areNotificationsEnabled(),
    ).thenAnswer((_) async => notifications);
    when(service.canScheduleExactAlarms()).thenAnswer((_) async => exact);

    await tester.pumpWidget(
      _host(NotificationSetupSheet(notificationService: service)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Belum aktif'), findsNWidgets(2));

    notifications = true;
    exact = true;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();

    expect(find.text('Aktif'), findsNWidgets(2));
    expect(find.text('Pengingat siap digunakan.'), findsOneWidget);
  });
}
