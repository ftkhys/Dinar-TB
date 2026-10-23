import 'dart:async';

import 'package:flutter/material.dart';
import 'package:timezone/timezone.dart' as tz;

import 'package:dinar_tb_patient/theme/app_theme.dart';

/// Time remaining until the next WIB midnight, floored at zero.
///
/// Pure so the rollover behaviour can be tested without waiting for a real
/// clock: the countdown is derived from the current WIB time, never from when
/// the app was opened.
@visibleForTesting
Duration wibTimeUntilMidnight(tz.TZDateTime now) {
  final nextMidnight = tz.TZDateTime(
    tz.local,
    now.year,
    now.month,
    now.day + 1,
  );
  final remaining = nextMidnight.difference(now);
  return remaining.isNegative ? Duration.zero : remaining;
}

/// Formats a duration as `HH:MM:SS` for the daily countdown.
@visibleForTesting
String formatCountdown(Duration remaining) {
  String two(int value) => value.toString().padLeft(2, '0');
  return '${two(remaining.inHours)}:${two(remaining.inMinutes % 60)}:'
      '${two(remaining.inSeconds % 60)}';
}

/// Whether the current WIB time is at or past the officer's last reminder
/// window. The countdown is intentionally hidden before that window: it is a
/// reminder-cycle indicator, not an all-day timer.
@visibleForTesting
bool isCountdownVisible(DateTime nowWib, String startTime) {
  final parts = startTime.split(':');
  if (parts.length < 2) return true;
  final hour = int.tryParse(parts[0]);
  final minute = int.tryParse(parts[1]);
  if (hour == null ||
      minute == null ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59) {
    return true;
  }
  return nowWib.hour > hour || (nowWib.hour == hour && nowWib.minute >= minute);
}

/// A small Beranda card showing how long is left in the current WIB day.
///
/// The card only appears once the last officer-configured reminder window has
/// started, so it does not run as an all-day timer. This is a daily-logging
/// indicator, not a medical dose limit: it only shows how much time remains
/// before the day (and therefore today's reminder cycle) ends. It refreshes
/// while the app is in the foreground and again on resume, and is never relied
/// upon for popup timing.
class DailyCountdown extends StatefulWidget {
  /// Start of the last reminder window (`HH:mm` WIB), e.g. `20:00`.
  final String startTime;

  const DailyCountdown({super.key, this.startTime = '20:00'});

  @override
  State<DailyCountdown> createState() => _DailyCountdownState();
}

class _DailyCountdownState extends State<DailyCountdown>
    with WidgetsBindingObserver {
  Timer? _timer;
  Duration _remaining = Duration.zero;
  bool _visible = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _update();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _update());
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _update();
  }

  void _update() {
    final clock = _readClock();
    if (!mounted ||
        (clock.remaining == _remaining && clock.visible == _visible)) {
      return;
    }
    setState(() {
      _remaining = clock.remaining;
      _visible = clock.visible;
    });
  }

  /// WIB countdown with a fixed UTC+7 fallback.
  ///
  /// The app initializes the timezone database before `runApp`, but widget
  /// tests mount this card without it. Falling back to a fixed offset keeps the
  /// card from crashing the whole screen in that situation.
  ({Duration remaining, bool visible}) _readClock() {
    try {
      final now = tz.TZDateTime.now(tz.local);
      return (
        remaining: wibTimeUntilMidnight(now),
        visible: isCountdownVisible(
          DateTime(now.year, now.month, now.day, now.hour, now.minute),
          widget.startTime,
        ),
      );
    } catch (_) {
      final nowWib = DateTime.now().toUtc().add(const Duration(hours: 7));
      final nextMidnight = DateTime(nowWib.year, nowWib.month, nowWib.day + 1);
      return (
        remaining: nextMidnight.difference(nowWib),
        visible: isCountdownVisible(nowWib, widget.startTime),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_visible) return const SizedBox.shrink();
    final finished = _remaining == Duration.zero;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppTheme.primaryBlue.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.timelapse_rounded,
              size: 24,
              color: AppTheme.primaryBlue,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Sisa waktu hari ini',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  finished ? 'Hari baru dimulai' : formatCountdown(_remaining),
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    fontFeatures: const [FontFeature.tabularFigures()],
                    color: finished ? AppTheme.green : AppTheme.primaryBlue,
                  ),
                ),
                const SizedBox(height: 2),
                const Text(
                  'Hitung mundur ke pukul 00.00 WIB. Bukan batas waktu '
                  'minum obat.',
                  style: TextStyle(
                    fontSize: 11,
                    color: Color(0xFF64748B),
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
