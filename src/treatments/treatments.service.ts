import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AuditLogService } from '../common/audit-log.service';
import { addCalendarMonths } from '../common/date-rules';
import { localTodayJakarta } from '../common/date-rules';
import { optionalString, requiredDate } from '../common/input';
import { Patient } from '../database/entities/patient.entity';
import { TreatmentCourse } from '../database/entities/treatment-course.entity';
import { TreatmentDecision } from '../database/enums';

@Injectable()
export class TreatmentsService {
  constructor(
    @InjectRepository(TreatmentCourse) private readonly treatments: Repository<TreatmentCourse>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly audit: AuditLogService,
  ) {}

  async create(patientId: string, input: Record<string, unknown>, staffId: string): Promise<TreatmentView> {
    if (!(await this.patients.existsBy({ id: patientId }))) throw new NotFoundException('Pasien tidak ditemukan.');
    if (await this.treatments.existsBy({ patientId, completedAt: IsNull() })) {
      throw new ConflictException('Pasien sudah memiliki treatment yang masih aktif.');
    }
    const startDate = requiredDate(input.startDate, 'Tanggal mulai pengobatan');
    const course = this.treatments.create({
      patientId,
      startDate,
      initialTargetEndDate: addCalendarMonths(startDate, 6),
      treatmentStage: optionalString(input.treatmentStage, 'Tahap pengobatan', 120),
    });
    const saved = await this.treatments.save(course);
    await this.audit.record({ actorStaffId: staffId, objectType: 'treatment_course', objectId: saved.id, action: 'created' });
    return this.present(saved);
  }

  async listByPatient(patientId: string): Promise<TreatmentView[]> {
    const courses = await this.treatments.find({ where: { patientId }, order: { startDate: 'ASC' } });
    return courses.map((course) => this.present(course));
  }

  async findOne(id: string): Promise<TreatmentView> {
    const course = await this.treatments.findOneBy({ id });
    if (!course) throw new NotFoundException('Treatment tidak ditemukan.');
    return this.present(course);
  }

  async review(id: string, input: Record<string, unknown>, staffId: string): Promise<TreatmentView> {
    const course = await this.findOne(id);
    if (course.finalDecision === TreatmentDecision.COMPLETED) {
      throw new ConflictException('Treatment yang sudah ditutup tidak dapat diubah.');
    }
    const decision = input.decision as TreatmentDecision;
    if (![TreatmentDecision.COMPLETED, TreatmentDecision.CONTINUED].includes(decision)) {
      throw new ConflictException('Keputusan harus Selesai atau Dilanjutkan.');
    }
    const note = optionalString(input.note, 'Keterangan tinjauan', 4000);
    if (!note) throw new ConflictException('Keterangan tinjauan wajib diisi.');
    const target = decision === TreatmentDecision.CONTINUED
      ? requiredDate(input.continuedTargetEndDate, 'Tanggal target lanjutan')
      : null;
    const now = new Date();
    course.finalDecision = decision;
    course.finalReviewNote = note;
    course.finalReviewedAt = now;
    course.continuedTargetEndDate = target;
    course.completedAt = decision === TreatmentDecision.COMPLETED ? now : null;
    const saved = await this.treatments.save(course);
    await this.audit.record({ actorStaffId: staffId, objectType: 'treatment_course', objectId: id, action: 'final_review', details: decision });
    return this.present(saved);
  }

  private present(course: TreatmentCourse): TreatmentView {
    const target = course.continuedTargetEndDate ?? course.initialTargetEndDate;
    return Object.assign(course, {
      reviewDue: !course.completedAt && target <= localTodayJakarta(),
      remindersEnabled: !course.completedAt,
    });
  }
}

export type TreatmentView = TreatmentCourse & { reviewDue: boolean; remindersEnabled: boolean };
