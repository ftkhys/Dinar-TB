// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reminder_window.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class ReminderWindowAdapter extends TypeAdapter<ReminderWindow> {
  @override
  final int typeId = 4;

  @override
  ReminderWindow read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return ReminderWindow(
      start: fields[0] as String,
      end: fields[1] as String,
    );
  }

  @override
  void write(BinaryWriter writer, ReminderWindow obj) {
    writer
      ..writeByte(2)
      ..writeByte(0)
      ..write(obj.start)
      ..writeByte(1)
      ..write(obj.end);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ReminderWindowAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
