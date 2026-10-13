import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { AuditLogService } from '../common/audit-log.service';
import { ActivationCode } from '../database/entities/activation-code.entity';
import { Patient } from '../database/entities/patient.entity';
import { PatientDevice } from '../database/entities/patient-device.entity';
import { AuthService } from '../auth/auth.service';

export const ACTIVATION_CODE_VALIDITY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ActivationService {
  constructor(
    @InjectRepository(ActivationCode) private readonly codes: Repository<ActivationCode>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(PatientDevice) private readonly devices: Repository<PatientDevice>,
    private readonly dataSource: DataSource,
    private readonly auth: AuthService,
    private readonly audit: AuditLogService,
  ) {}

  async issueCode(patientId: string, staffId: string): Promise<{ activationCode: string; expiresAt: string }> {
    const patient = await this.patients.findOneBy({ id: patientId });
    if (!patient) throw new NotFoundException('Pasien tidak ditemukan.');
    const code = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ACTIVATION_CODE_VALIDITY_MS);
    await this.codes.save(this.codes.create({
      patientId,
      codeHash: hash(code),
      expiresAt,
      usedAt: null,
      issuedByStaffId: staffId,
    }));
    await this.audit.record({ actorStaffId: staffId, objectType: 'activation_code', objectId: patientId, action: 'issued', details: expiresAt.toISOString() });
    return { activationCode: code, expiresAt: expiresAt.toISOString() };
  }

  async activate(code: string, deviceIdentifier: string): Promise<{ deviceId: string; deviceCredential: string; accessToken: string }> {
    const codeHash = hash(code);
    const now = new Date();
    const deviceCredential = randomBytes(32).toString('base64url');
    const result = await this.dataSource.transaction(async (manager) => {
      const codeRow = await manager.getRepository(ActivationCode).createQueryBuilder('code')
        .addSelect('code.codeHash')
        .setLock('pessimistic_write')
        .where('code.codeHash = :codeHash', { codeHash })
        .getOne();
      if (!codeRow || codeRow.usedAt || codeRow.expiresAt <= now) {
        throw new UnauthorizedException('Kode aktivasi tidak berlaku atau sudah digunakan.');
      }
      const patient = await manager.getRepository(Patient).createQueryBuilder('patient')
        .setLock('pessimistic_write')
        .where('patient.id = :id', { id: codeRow.patientId })
        .getOne();
      if (!patient) throw new NotFoundException('Pasien tidak ditemukan.');
      const deviceRepo = manager.getRepository(PatientDevice);
      let sameDevice = await deviceRepo.findOneBy({ deviceIdentifier });
      if (sameDevice && sameDevice.patientId !== patient.id) {
        throw new ConflictException('Device ini sudah terhubung ke pasien lain.');
      }
      await deviceRepo.createQueryBuilder()
        .update(PatientDevice)
        .set({ deactivatedAt: now })
        .where('patient_id = :patientId AND deactivated_at IS NULL', { patientId: patient.id })
        .execute();
      if (sameDevice) {
        await deviceRepo.createQueryBuilder()
          .update(PatientDevice)
          .set({ credentialHash: hash(deviceCredential), activatedAt: now, deactivatedAt: null })
          .where('id = :id', { id: sameDevice.id })
          .execute();
        sameDevice = await deviceRepo.findOneByOrFail({ id: sameDevice.id });
      } else {
        sameDevice = await deviceRepo.save(deviceRepo.create({
          patientId: patient.id,
          deviceIdentifier,
          credentialHash: hash(deviceCredential),
          activatedAt: now,
          deactivatedAt: null,
        }));
      }
      codeRow.usedAt = now;
      await manager.save(codeRow);
      return { device: sameDevice, patientId: patient.id };
    });
    await this.audit.record({ actorStaffId: null, objectType: 'patient_device', objectId: result.device.id, action: 'activated' });
    return {
      deviceId: result.device.id,
      deviceCredential,
      accessToken: this.auth.sign({ sub: result.device.id, kind: 'patient_device', patientId: result.patientId, version: result.device.version }, 30 * 24 * 60 * 60),
    };
  }

  async refresh(deviceId: string, credential: string): Promise<{ accessToken: string }> {
    const device = await this.devices.createQueryBuilder('device')
      .addSelect('device.credentialHash')
      .where('device.id = :deviceId', { deviceId })
      .andWhere('device.deactivatedAt IS NULL')
      .getOne();
    if (!device || !safeHashEqual(device.credentialHash, hash(credential))) {
      throw new UnauthorizedException('Kredensial device tidak berlaku.');
    }
    return {
      accessToken: this.auth.sign({ sub: device.id, kind: 'patient_device', patientId: device.patientId, version: device.version }, 30 * 24 * 60 * 60),
    };
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeHashEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
