// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'adherence_history.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class AdherenceHistoryAdapter extends TypeAdapter<AdherenceHistory> {
  @override
  final int typeId = 5;

  @override
  AdherenceHistory read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return AdherenceHistory(
      treatmentCourseId: fields[0] as String?,
      days: (fields[1] as List).cast<AdherenceDay>(),
      totalTaken: fields[2] as int,
      totalMissed: fields[3] as int,
      missedStreak: fields[4] as int,
    );
  }

  @override
  void write(BinaryWriter writer, AdherenceHistory obj) {
    writer
      ..writeByte(5)
      ..writeByte(0)
      ..write(obj.treatmentCourseId)
      ..writeByte(1)
      ..write(obj.days)
      ..writeByte(2)
      ..write(obj.totalTaken)
      ..writeByte(3)
      ..write(obj.totalMissed)
      ..writeByte(4)
      ..write(obj.missedStreak);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AdherenceHistoryAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}

class AdherenceDayAdapter extends TypeAdapter<AdherenceDay> {
  @override
  final int typeId = 6;

  @override
  AdherenceDay read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return AdherenceDay(
      date: fields[0] as String,
      status: fields[1] as String,
      confirmedAt: fields[2] as String?,
    );
  }

  @override
  void write(BinaryWriter writer, AdherenceDay obj) {
    writer
      ..writeByte(3)
      ..writeByte(0)
      ..write(obj.date)
      ..writeByte(1)
      ..write(obj.status)
      ..writeByte(2)
      ..write(obj.confirmedAt);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AdherenceDayAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
