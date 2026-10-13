import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogService } from '../common/audit-log.service';
import { optionalString, requiredString } from '../common/input';
import { Patient } from '../database/entities/patient.entity';

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly audit: AuditLogService,
  ) {}

  async create(input: Record<string, unknown>, staffId: string): Promise<PatientOutput> {
    const patient = this.patients.create({
      fullName: requiredString(input.fullName, 'Nama pasien', 200),
      registerNumber: requiredString(input.registerNumber, 'Nomor Register Pasien', 100),
      medicalRecordNumber: requiredString(input.medicalRecordNumber, 'Nomor Rekam Medis', 100),
      address: requiredString(input.address, 'Alamat', 4000),
      nik: optionalString(input.nik, 'NIK', 32),
      pmoName: optionalString(input.pmoName, 'Nama PMO', 200),
      pmoContact: optionalString(input.pmoContact, 'Kontak PMO', 100),
      createdByStaffId: staffId,
    });
    const saved = await this.patients.save(patient);
    await this.audit.record({ actorStaffId: staffId, objectType: 'patient', objectId: saved.id, action: 'created' });
    return withoutNik(saved);
  }

  async findAll(search?: string): Promise<PatientOutput[]> {
    const query = this.patients.createQueryBuilder('patient').orderBy('patient.fullName', 'ASC');
    if (search?.trim()) {
      query.where(
        '(patient.fullName ILIKE :search OR patient.registerNumber ILIKE :search OR patient.medicalRecordNumber ILIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }
    return (await query.take(500).getMany()).map(withoutNik);
  }

  async findOne(id: string): Promise<PatientOutput> {
    return withoutNik(await this.findEntity(id));
  }

  async update(id: string, input: Record<string, unknown>, staffId: string, expectedVersion?: number): Promise<PatientOutput> {
    const patient = await this.findEntity(id);
    if (expectedVersion !== undefined && patient.version !== expectedVersion) {
      const { ConflictException } = await import('@nestjs/common');
      throw new ConflictException({ message: 'Data pasien sudah berubah di server.', current: patient });
    }
    const changed: string[] = [];
    const textFields: Array<[string, keyof Patient, number]> = [
      ['fullName', 'fullName', 200],
      ['registerNumber', 'registerNumber', 100],
      ['medicalRecordNumber', 'medicalRecordNumber', 100],
      ['address', 'address', 4000],
    ];
    for (const [inputKey, property, maxLength] of textFields) {
      if (input[inputKey] !== undefined) {
        (patient[property] as unknown) = requiredString(input[inputKey], inputKey, maxLength);
        changed.push(inputKey);
      }
    }
    for (const [inputKey, property, maxLength] of [
      ['nik', 'nik', 32],
      ['pmoName', 'pmoName', 200],
      ['pmoContact', 'pmoContact', 100],
    ] as Array<[string, keyof Patient, number]>) {
      if (input[inputKey] !== undefined) {
        (patient[property] as unknown) = optionalString(input[inputKey], inputKey, maxLength);
        changed.push(inputKey);
      }
    }
    if (!changed.length) return patient;
    const saved = await this.patients.save(patient);
    await this.audit.record({ actorStaffId: staffId, objectType: 'patient', objectId: id, action: 'identity_updated', details: changed.join(',') });
    return withoutNik(saved);
  }

  private async findEntity(id: string): Promise<Patient> {
    const patient = await this.patients.findOneBy({ id });
    if (!patient) throw new NotFoundException('Pasien tidak ditemukan.');
    return patient;
  }
}

type PatientOutput = Omit<Patient, 'nik'>;

function withoutNik(patient: Patient): PatientOutput {
  const { nik: _nik, ...safe } = patient;
  return safe;
}
