// Regression test for the "Ingatkan dalam 30 menit lagi" notification action.
//
// flutter_local_notifications delivers action buttons through the manifest
// receiver below. If it is missing, tapping the action is silently dropped and
// the background handler (and therefore the snooze) never runs.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('the Android manifest declares the notification action receiver', () {
    final manifest = File(
      'android/app/src/main/AndroidManifest.xml',
    ).readAsStringSync();

    expect(
      manifest,
      contains(
        'com.dexterous.flutterlocalnotifications.ActionBroadcastReceiver',
      ),
    );
    // The receiver must not be exported.
    final receiverStart = manifest.indexOf(
      'com.dexterous.flutterlocalnotifications.ActionBroadcastReceiver',
    );
    final receiverTag = manifest.substring(
      manifest.lastIndexOf('<receiver', receiverStart),
      manifest.indexOf('/>', receiverStart),
    );
    expect(receiverTag, contains('android:exported="false"'));
  });

  test('the boot receiver is still declared for reboot rescheduling', () {
    final manifest = File(
      'android/app/src/main/AndroidManifest.xml',
    ).readAsStringSync();

    expect(
      manifest,
      contains(
        'com.dexterous.flutterlocalnotifications.ScheduledNotificationBootReceiver',
      ),
    );
    expect(manifest, contains('android.intent.action.BOOT_COMPLETED'));
  });
}
