// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'visit_record.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class VisitRecordAdapter extends TypeAdapter<VisitRecord> {
  @override
  final int typeId = 9;

  @override
  VisitRecord read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return VisitRecord(
      id: fields[0] as String,
      visitDate: fields[1] as String,
      medicineGiven: fields[2] as bool,
      medicationGivenOn: fields[3] as String?,
      complaintProgress: fields[4] as String?,
      additionalNote: fields[5] as String?,
    );
  }

  @override
  void write(BinaryWriter writer, VisitRecord obj) {
    writer
      ..writeByte(6)
      ..writeByte(0)
      ..write(obj.id)
      ..writeByte(1)
      ..write(obj.visitDate)
      ..writeByte(2)
      ..write(obj.medicineGiven)
      ..writeByte(3)
      ..write(obj.medicationGivenOn)
      ..writeByte(4)
      ..write(obj.complaintProgress)
      ..writeByte(5)
      ..write(obj.additionalNote);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is VisitRecordAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
