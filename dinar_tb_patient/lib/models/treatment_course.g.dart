// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'treatment_course.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class TreatmentCourseAdapter extends TypeAdapter<TreatmentCourse> {
  @override
  final int typeId = 1;

  @override
  TreatmentCourse read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return TreatmentCourse(
      id: fields[0] as String,
      patientId: fields[1] as String,
      startDate: fields[2] as String,
      initialTargetEndDate: fields[3] as String,
      finalDecision: fields[4] as String?,
      finalReviewNote: fields[5] as String?,
      finalReviewedAt: fields[6] as DateTime?,
      continuedTargetEndDate: fields[7] as String?,
      completedAt: fields[8] as DateTime?,
      version: fields[9] as int,
      reviewDue: fields[10] as bool,
      remindersEnabled: fields[11] as bool,
      displayMessage: fields[12] as String?,
    );
  }

  @override
  void write(BinaryWriter writer, TreatmentCourse obj) {
    writer
      ..writeByte(13)
      ..writeByte(0)
      ..write(obj.id)
      ..writeByte(1)
      ..write(obj.patientId)
      ..writeByte(2)
      ..write(obj.startDate)
      ..writeByte(3)
      ..write(obj.initialTargetEndDate)
      ..writeByte(4)
      ..write(obj.finalDecision)
      ..writeByte(5)
      ..write(obj.finalReviewNote)
      ..writeByte(6)
      ..write(obj.finalReviewedAt)
      ..writeByte(7)
      ..write(obj.continuedTargetEndDate)
      ..writeByte(8)
      ..write(obj.completedAt)
      ..writeByte(9)
      ..write(obj.version)
      ..writeByte(10)
      ..write(obj.reviewDue)
      ..writeByte(11)
      ..write(obj.remindersEnabled)
      ..writeByte(12)
      ..write(obj.displayMessage);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is TreatmentCourseAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
