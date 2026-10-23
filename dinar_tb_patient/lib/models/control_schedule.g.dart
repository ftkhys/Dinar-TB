// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'control_schedule.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class ControlScheduleAdapter extends TypeAdapter<ControlSchedule> {
  @override
  final int typeId = 2;

  @override
  ControlSchedule read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return ControlSchedule(
      treatmentCourseId: fields[0] as String,
      referenceVisitId: fields[1] as String?,
      defaultDate: fields[2] as String?,
      scheduledDate: fields[3] as String,
      version: fields[4] as int,
      overriddenAt: fields[5] as DateTime?,
    );
  }

  @override
  void write(BinaryWriter writer, ControlSchedule obj) {
    writer
      ..writeByte(6)
      ..writeByte(0)
      ..write(obj.treatmentCourseId)
      ..writeByte(1)
      ..write(obj.referenceVisitId)
      ..writeByte(2)
      ..write(obj.defaultDate)
      ..writeByte(3)
      ..write(obj.scheduledDate)
      ..writeByte(4)
      ..write(obj.version)
      ..writeByte(5)
      ..write(obj.overriddenAt);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ControlScheduleAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
