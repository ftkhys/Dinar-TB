// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'adherence_operation.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class AdherenceOperationAdapter extends TypeAdapter<AdherenceOperation> {
  @override
  final int typeId = 7;

  @override
  AdherenceOperation read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return AdherenceOperation(
      operationId: fields[0] as String,
      treatmentCourseId: fields[1] as String,
      adherenceDate: fields[2] as String,
      confirmedAt: fields[3] as String,
      expectedTreatmentVersion: fields[4] as int,
      retryCount: fields[5] as int,
      createdAt: fields[6] as DateTime,
      lastAttemptAt: fields[7] as DateTime?,
      status: fields[8] as AdherenceOperationStatus,
    );
  }

  @override
  void write(BinaryWriter writer, AdherenceOperation obj) {
    writer
      ..writeByte(9)
      ..writeByte(0)
      ..write(obj.operationId)
      ..writeByte(1)
      ..write(obj.treatmentCourseId)
      ..writeByte(2)
      ..write(obj.adherenceDate)
      ..writeByte(3)
      ..write(obj.confirmedAt)
      ..writeByte(4)
      ..write(obj.expectedTreatmentVersion)
      ..writeByte(5)
      ..write(obj.retryCount)
      ..writeByte(6)
      ..write(obj.createdAt)
      ..writeByte(7)
      ..write(obj.lastAttemptAt)
      ..writeByte(8)
      ..write(obj.status);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AdherenceOperationAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}

class AdherenceOperationStatusAdapter
    extends TypeAdapter<AdherenceOperationStatus> {
  @override
  final int typeId = 8;

  @override
  AdherenceOperationStatus read(BinaryReader reader) {
    switch (reader.readByte()) {
      case 0:
        return AdherenceOperationStatus.pending;
      case 1:
        return AdherenceOperationStatus.needsAttention;
      case 2:
        return AdherenceOperationStatus.completed;
      default:
        return AdherenceOperationStatus.pending;
    }
  }

  @override
  void write(BinaryWriter writer, AdherenceOperationStatus obj) {
    switch (obj) {
      case AdherenceOperationStatus.pending:
        writer.writeByte(0);
        break;
      case AdherenceOperationStatus.needsAttention:
        writer.writeByte(1);
        break;
      case AdherenceOperationStatus.completed:
        writer.writeByte(2);
        break;
    }
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AdherenceOperationStatusAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
