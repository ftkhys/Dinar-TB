// Guards the confirmation timestamp format. The backend stores the value it
// receives by running `new Date(value).toISOString()`, so the string the app
// sends must already be in that canonical (millisecond) form or the
// confirmation is rejected with HTTP 400 and never synced.

import 'package:flutter_test/flutter_test.dart';
import 'package:dinar_tb_patient/services/notification_service.dart';

void main() {
  group('isoMillisUtc', () {
    test('truncates microseconds to three fractional digits', () {
      final value = DateTime.utc(2026, 10, 18, 13, 45, 30, 123, 456);
      expect(isoMillisUtc(value), '2026-10-18T13:45:30.123Z');
    });

    test('always emits three fractional digits when milliseconds are zero', () {
      final value = DateTime.utc(2026, 10, 18, 13, 45, 30);
      expect(isoMillisUtc(value), '2026-10-18T13:45:30.000Z');
    });

    test('converts a non-UTC instant to UTC with a Z suffix', () {
      final value = DateTime.utc(2026, 1, 2, 3, 4, 5, 6, 0);
      expect(isoMillisUtc(value), '2026-01-02T03:04:05.006Z');
    });

    test('round-trips through JavaScript canonical parsing', () {
      // The regression was that Dart emitted `...123456Z`, which JS parses and
      // re-serialises as `...123Z`, so a strict string compare failed.
      final dart = DateTime.utc(2026, 10, 18, 13, 45, 30, 123, 456);
      final formatted = isoMillisUtc(dart);
      final reparsed = DateTime.parse(formatted).toUtc();
      expect(reparsed.millisecond, 123);
      expect(formatted.length, '2026-10-18T13:45:30.123Z'.length);
    });
  });
}
