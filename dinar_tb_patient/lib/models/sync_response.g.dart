// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sync_response.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class SyncResponseAdapter extends TypeAdapter<SyncResponse> {
  @override
  final int typeId = 3;

  @override
  SyncResponse read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return SyncResponse(
      patient: fields[0] as Patient,
      treatmentCourses: (fields[1] as List).cast<TreatmentCourse>(),
      controlSchedules: (fields[2] as List).cast<ControlSchedule>(),
      reminderWindows: (fields[3] as List).cast<ReminderWindow>(),
      serverTime: fields[4] as String,
      hasMore: fields[5] as bool,
      maxVersion: fields[6] as int,
    );
  }

  @override
  void write(BinaryWriter writer, SyncResponse obj) {
    writer
      ..writeByte(7)
      ..writeByte(0)
      ..write(obj.patient)
      ..writeByte(1)
      ..write(obj.treatmentCourses)
      ..writeByte(2)
      ..write(obj.controlSchedules)
      ..writeByte(3)
      ..write(obj.reminderWindows)
      ..writeByte(4)
      ..write(obj.serverTime)
      ..writeByte(5)
      ..write(obj.hasMore)
      ..writeByte(6)
      ..write(obj.maxVersion);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is SyncResponseAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
