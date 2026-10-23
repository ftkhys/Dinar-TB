import 'package:hive/hive.dart';

part 'patient.g.dart';

@HiveType(typeId: 0)
class Patient extends HiveObject {
  @HiveField(0)
  final String id;

  @HiveField(1)
  final String fullName;

  @HiveField(2)
  final String registerNumber;

  @HiveField(4)
  final String address;

  @HiveField(5)
  final int version;

  /// Official activation status from staff. Null means the patient is active;
  /// a timestamp means staff archived/deactivated the patient. Kept as the last
  /// successfully synced value so an offline device does not invent a change.
  @HiveField(6)
  final DateTime? archivedAt;

  Patient({
    required this.id,
    required this.fullName,
    required this.registerNumber,
    required this.address,
    required this.version,
    this.archivedAt,
  });

  bool get isArchived => archivedAt != null;

  factory Patient.fromJson(Map<String, dynamic> json) {
    final archived = json['archivedAt'];
    return Patient(
      id: json['id'] as String,
      fullName: json['fullName'] as String,
      registerNumber: json['registerNumber'] as String,
      address: json['address'] as String,
      version: json['version'] as int,
      archivedAt: archived is String ? DateTime.tryParse(archived) : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'fullName': fullName,
      'registerNumber': registerNumber,
      'address': address,
      'version': version,
      'archivedAt': archivedAt?.toUtc().toIso8601String(),
    };
  }
}
