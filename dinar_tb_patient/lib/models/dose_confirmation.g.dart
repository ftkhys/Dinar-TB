// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dose_confirmation.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class DoseConfirmationAdapter extends TypeAdapter<DoseConfirmation> {
  @override
  final int typeId = 10;

  @override
  DoseConfirmation read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return DoseConfirmation(
      treatmentCourseId: fields[0] as String,
      wibDate: fields[1] as String,
      confirmedAtUtc: fields[2] as String,
      window: fields[3] as String?,
    );
  }

  @override
  void write(BinaryWriter writer, DoseConfirmation obj) {
    writer
      ..writeByte(4)
      ..writeByte(0)
      ..write(obj.treatmentCourseId)
      ..writeByte(1)
      ..write(obj.wibDate)
      ..writeByte(2)
      ..write(obj.confirmedAtUtc)
      ..writeByte(3)
      ..write(obj.window);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is DoseConfirmationAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
