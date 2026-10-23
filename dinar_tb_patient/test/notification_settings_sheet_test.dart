// Regression tests for the simplified "Pengaturan Notifikasi" sheet.
//
// The sheet must show a plain-language reminder status, never leak technical
// diagnostics, and still distinguish a real scheduling failure from a pending
// list that simply could not be read.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';

import 'package:dinar_tb_patient/screens/profil_screen.dart';

import 'sync_service_retry_test.mocks.dart';

Widget _host(Widget child) => MaterialApp(
  home: Scaffold(body: SizedBox.expand(child: child)),
);

void main() {
  late MockNotificationService service;

  setUp(() {
    service = MockNotificationService();
  });

  testWidgets(
    'a failing platform read shows an error and retry, not a spinner',
    (tester) async {
      when(
        service.areNotificationsEnabled(),
      ).thenThrow(Exception('missing plugin'));
      when(
        service.canScheduleExactAlarms(),
      ).thenThrow(Exception('missing plugin'));
      when(
        service.pendingNotificationCount(),
      ).thenThrow(Exception('missing plugin'));
      when(service.hasReminderSchedulingFailure).thenReturn(false);

      await tester.pumpWidget(
        _host(
          NotificationSettingsSheet(
            notificationService: service,
            showTestTools: false,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(find.textContaining('tidak dapat dimuat'), findsOneWidget);
      expect(find.text('Coba Lagi'), findsOneWidget);
    },
  );

  testWidgets('a successful read shows a simple active reminder status', (
    tester,
  ) async {
    when(service.areNotificationsEnabled()).thenAnswer((_) async => true);
    when(service.canScheduleExactAlarms()).thenAnswer((_) async => true);
    when(service.pendingNotificationCount()).thenAnswer((_) async => 3);
    when(service.hasReminderSchedulingFailure).thenReturn(false);

    await tester.pumpWidget(
      _host(
        NotificationSettingsSheet(
          notificationService: service,
          showTestTools: false,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Pengingat obat'), findsOneWidget);
    expect(
      find.text('Anda akan diingatkan sesuai jadwal dari petugas.'),
      findsOneWidget,
    );
    expect(find.textContaining('Saluran pengingat'), findsNothing);
    expect(find.textContaining('3 notifikasi'), findsNothing);
    expect(find.textContaining('terdaftar di Android'), findsNothing);
    expect(find.text('Kirim Notifikasi Uji Sekarang'), findsNothing);
    expect(find.text('Uji Notifikasi Terjadwal 1 Menit'), findsNothing);
  });

  testWidgets('test tools are visible only when explicitly enabled', (
    tester,
  ) async {
    when(service.areNotificationsEnabled()).thenAnswer((_) async => true);
    when(service.canScheduleExactAlarms()).thenAnswer((_) async => true);
    when(service.pendingNotificationCount()).thenAnswer((_) async => 3);
    when(service.hasReminderSchedulingFailure).thenReturn(false);

    await tester.pumpWidget(
      _host(
        NotificationSettingsSheet(
          notificationService: service,
          showTestTools: true,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Kirim Notifikasi Uji Sekarang'), findsOneWidget);
    expect(find.text('Uji Notifikasi Terjadwal 1 Menit'), findsOneWidget);
  });

  testWidgets('an unreadable pending list does not hide a working schedule', (
    tester,
  ) async {
    when(service.areNotificationsEnabled()).thenAnswer((_) async => true);
    when(service.canScheduleExactAlarms()).thenAnswer((_) async => true);
    when(
      service.pendingNotificationCount(),
    ).thenThrow(Exception('cache unreadable'));
    when(service.hasReminderSchedulingFailure).thenReturn(false);

    await tester.pumpWidget(
      _host(
        NotificationSettingsSheet(
          notificationService: service,
          showTestTools: false,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Pengingat obat sudah diproses di perangkat ini.'),
      findsOneWidget,
    );
    expect(find.textContaining('Gagal dibaca'), findsNothing);
    expect(find.text('Coba Lagi'), findsNothing);
  });

  testWidgets('a real scheduling failure is reported truthfully', (
    tester,
  ) async {
    when(service.areNotificationsEnabled()).thenAnswer((_) async => true);
    when(service.canScheduleExactAlarms()).thenAnswer((_) async => true);
    when(service.pendingNotificationCount()).thenAnswer((_) async => 4);
    when(service.hasReminderSchedulingFailure).thenReturn(true);

    await tester.pumpWidget(
      _host(
        NotificationSettingsSheet(
          notificationService: service,
          showTestTools: false,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.textContaining('Sebagian pengingat belum bisa dijadwalkan'),
      findsOneWidget,
    );
  });

  testWidgets('a scheduling failure offers a real reschedule that clears it', (
    tester,
  ) async {
    var schedulingFailed = true;
    when(service.areNotificationsEnabled()).thenAnswer((_) async => true);
    when(service.canScheduleExactAlarms()).thenAnswer((_) async => true);
    when(service.pendingNotificationCount()).thenAnswer((_) async => 4);
    when(
      service.hasReminderSchedulingFailure,
    ).thenAnswer((_) => schedulingFailed);
    when(service.refreshRoutineReminders(force: true)).thenAnswer((_) async {
      schedulingFailed = false;
    });

    await tester.pumpWidget(
      _host(
        NotificationSettingsSheet(
          notificationService: service,
          showTestTools: false,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Jadwalkan Ulang Pengingat'), findsOneWidget);
    await tester.tap(find.text('Jadwalkan Ulang Pengingat'));
    await tester.pumpAndSettle();

    verify(service.refreshRoutineReminders(force: true)).called(1);
    expect(
      find.textContaining('Sebagian pengingat belum bisa dijadwalkan'),
      findsNothing,
    );
    expect(
      find.text('Anda akan diingatkan sesuai jadwal dari petugas.'),
      findsOneWidget,
    );
  });

  testWidgets('retry reloads the settings after a failure', (tester) async {
    when(
      service.areNotificationsEnabled(),
    ).thenThrow(Exception('temporary failure'));
    when(service.canScheduleExactAlarms()).thenAnswer((_) async => false);
    when(service.pendingNotificationCount()).thenAnswer((_) async => 0);
    when(service.hasReminderSchedulingFailure).thenReturn(false);

    await tester.pumpWidget(
      _host(
        NotificationSettingsSheet(
          notificationService: service,
          showTestTools: false,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Coba Lagi'), findsOneWidget);

    reset(service);
    when(service.areNotificationsEnabled()).thenAnswer((_) async => false);
    when(service.canScheduleExactAlarms()).thenAnswer((_) async => false);
    when(service.pendingNotificationCount()).thenAnswer((_) async => 0);
    when(service.hasReminderSchedulingFailure).thenReturn(false);

    await tester.tap(find.text('Coba Lagi'));
    await tester.pumpAndSettle();

    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.text('Notifikasi belum diizinkan.'), findsOneWidget);
    expect(find.text('Izinkan Notifikasi'), findsOneWidget);
  });

  testWidgets('permissions are re-read when the app resumes', (tester) async {
    var enabled = false;
    when(service.areNotificationsEnabled()).thenAnswer((_) async => enabled);
    when(service.canScheduleExactAlarms()).thenAnswer((_) async => true);
    when(service.pendingNotificationCount()).thenAnswer((_) async => 0);
    when(service.hasReminderSchedulingFailure).thenReturn(false);

    await tester.pumpWidget(
      _host(
        NotificationSettingsSheet(
          notificationService: service,
          showTestTools: false,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Notifikasi belum diizinkan.'), findsOneWidget);

    enabled = true;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();

    expect(find.text('Pengingat obat'), findsOneWidget);
    expect(find.text('Izinkan Notifikasi'), findsNothing);
  });
}
