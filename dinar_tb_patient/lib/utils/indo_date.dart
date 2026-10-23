import 'package:timezone/timezone.dart' as tz;

/// Indonesian date helpers.
///
/// Hand-rolled instead of `intl`'s `DateFormat` so we do not depend on
/// `initializeDateFormatting` being called before the first frame.
class IndoDate {
  static const List<String> _hari = [
    'Senin',
    'Selasa',
    'Rabu',
    'Kamis',
    'Jumat',
    'Sabtu',
    'Minggu',
  ];

  static const List<String> _bulan = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];

  static const List<String> _bulanSingkat = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MEI',
    'JUN',
    'JUL',
    'AGU',
    'SEP',
    'OKT',
    'NOV',
    'DES',
  ];

  /// Current time in Asia/Jakarta, falling back to device local time if the
  /// timezone database has not been initialised yet.
  static DateTime nowJakarta() {
    try {
      return tz.TZDateTime.now(tz.getLocation('Asia/Jakarta'));
    } catch (_) {
      return DateTime.now();
    }
  }

  /// Parses an ISO-8601 timestamp and converts it to Asia/Jakarta, falling back
  /// to device local time if the timezone database is unavailable.
  static DateTime? parseIsoJakarta(String? iso) {
    if (iso == null) return null;
    final parsed = DateTime.tryParse(iso);
    if (parsed == null) return null;
    try {
      return tz.TZDateTime.from(parsed, tz.getLocation('Asia/Jakarta'));
    } catch (_) {
      return parsed.toLocal();
    }
  }

  /// Parses a `YYYY-MM-DD` string into a local `DateTime` (date only).
  static DateTime? parseDateOnly(String? value) {
    if (value == null || value.isEmpty) return null;
    final parts = value.split('-');
    if (parts.length != 3) return null;
    final year = int.tryParse(parts[0]);
    final month = int.tryParse(parts[1]);
    final day = int.tryParse(parts[2]);
    if (year == null || month == null || day == null) return null;
    return DateTime(year, month, day);
  }

  static String hari(DateTime date) => _hari[date.weekday - 1];

  static String bulan(DateTime date) => _bulan[date.month - 1];

  static String bulanSingkat(DateTime date) => _bulanSingkat[date.month - 1];

  /// e.g. `Sabtu, 10 Oktober 2026`.
  static String lengkap(DateTime date) =>
      '${hari(date)}, ${date.day} ${bulan(date)} ${date.year}';

  /// e.g. `10 Okt 2026`.
  static String medium(DateTime date) =>
      '${date.day} ${_bulanSingkat[date.month - 1][0]}${_bulanSingkat[date.month - 1].substring(1).toLowerCase()} ${date.year}';

  /// e.g. `07.12`.
  static String jamMenit(DateTime date) =>
      '${date.hour.toString().padLeft(2, '0')}.${date.minute.toString().padLeft(2, '0')}';

  /// Whole days from [today] (date-only) to [target] (date-only). Negative when
  /// the target is in the past.
  static int selisihHari(DateTime target, DateTime today) {
    final t = DateTime(target.year, target.month, target.day);
    final n = DateTime(today.year, today.month, today.day);
    return t.difference(n).inDays;
  }

  /// Human label for a future date: `Hari ini`, `Besok`, or `N hari lagi`.
  static String labelSelisih(DateTime target, DateTime today) {
    final diff = selisihHari(target, today);
    if (diff == 0) return 'Hari ini';
    if (diff == 1) return 'Besok';
    if (diff > 1) return '$diff hari lagi';
    if (diff == -1) return 'Kemarin';
    return '${diff.abs()} hari lalu';
  }
}
