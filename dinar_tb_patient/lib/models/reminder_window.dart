import 'package:hive/hive.dart';

part 'reminder_window.g.dart';

@HiveType(typeId: 4)
class ReminderWindow extends HiveObject {
  @HiveField(0)
  final String start;

  @HiveField(1)
  final String end;

  ReminderWindow({required this.start, required this.end});

  factory ReminderWindow.fromJson(Map<String, dynamic> json) {
    return ReminderWindow(
      start: json['start'] as String,
      end: json['end'] as String,
    );
  }

  Map<String, dynamic> toJson() {
    return {'start': start, 'end': end};
  }
}
