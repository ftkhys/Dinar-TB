import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ReportsService } from './reports.service';

function serviceWith(rows: Array<Record<string, unknown>>) {
  const query = jest.fn().mockResolvedValue(rows);
  return { service: new ReportsService({ query } as never), query };
}

describe('ReportsService', () => {
  describe('validation', () => {
    it('rejects an unknown category', async () => {
      const { service } = serviceWith([]);
      await expect(service.build({ category: 'Lainnya', from: '2026-10-01', to: '2026-10-17' }))
        .rejects.toThrow(BadRequestException);
    });

    it('rejects invalid or reversed date ranges', async () => {
      const { service } = serviceWith([]);
      await expect(service.build({ category: 'Data Pasien', from: '01-10-2026', to: '2026-10-17' }))
        .rejects.toThrow(BadRequestException);
      await expect(service.build({ category: 'Data Pasien', from: '2026-10-17', to: '2026-10-01' }))
        .rejects.toThrow(BadRequestException);
    });

    it('rejects a malformed patient filter', async () => {
      const { service } = serviceWith([]);
      await expect(service.build({ category: 'Data Pasien', from: '2026-10-01', to: '2026-10-17', patientId: 'abc' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  it('builds the Data Pasien preview without exposing NIK', async () => {
    const { service, query } = serviceWith([
      {
        registerNumber: 'REG-1', patientName: 'Siti', medicalRecordNumber: 'RM-1', address: 'Jl. A',
        dateOfBirth: '1990-01-01', gender: 'Perempuan', phone: '0812', treatmentStage: 'Bulan ke-2',
        startDate: '2026-10-01', nextControlDate: '2026-10-28', active: true,
      },
      {
        registerNumber: 'REG-2', patientName: 'Ahmad', medicalRecordNumber: 'RM-2', address: 'Jl. B',
        dateOfBirth: null, gender: null, phone: null, treatmentStage: null,
        startDate: null, nextControlDate: null, active: false,
      },
      {
        registerNumber: 'REG-3', patientName: 'Rina', medicalRecordNumber: 'RM-3', address: 'Jl. C',
        dateOfBirth: null, gender: null, phone: null, treatmentStage: 'Tahap 1',
        startDate: '2026-10-22', nextControlDate: null, active: false,
      },
    ]);

    const preview = await service.build(
      { category: 'Data Pasien', from: '2026-10-01', to: '2026-10-17' },
      new Date('2026-10-21T03:00:00.000Z'),
    );

    expect(preview.total).toBe(3);
    expect(preview.columns.map((column) => column.key)).not.toContain('nik');
    expect(preview.rows[0].status).toBe('Aktif');
    expect(preview.rows[1].status).toBe('Selesai');
    expect(preview.rows[2].status).toBe('Belum dimulai');
    expect(preview.rows[1].dateOfBirth).toBe('—');
    expect(preview.summary).toEqual([
      { label: 'Total pasien', value: 3 },
      { label: 'Pengobatan aktif', value: 1 },
      { label: 'Tanpa pengobatan aktif', value: 2 },
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('tc.start_date <= $4::date'), [
      '2026-10-01', '2026-10-17', null, '2026-10-21',
    ]);
  });

  it('formats confirmation timestamps in Jakarta time', async () => {
    const { service } = serviceWith([
      {
        treatmentCourseId: 'course-1', startDate: '2026-10-17', completedAt: null,
        adherenceDate: '2026-10-17', registerNumber: 'REG-1', patientName: 'Siti',
        confirmedAt: '2026-10-17T00:18:00.000Z',
      },
      {
        treatmentCourseId: 'course-2', startDate: '2026-10-17', completedAt: null,
        adherenceDate: null, registerNumber: 'REG-2', patientName: 'Ahmad', confirmedAt: null,
      },
    ]);

    const preview = await service.build({ category: 'Konfirmasi Minum Obat', from: '2026-10-17', to: '2026-10-17' }, new Date('2026-10-18T03:00:00.000Z'));

    expect(preview.rows.find((row) => row.patientName === 'Siti')?.confirmedAt).toBe('17 Okt 2026, 07.18 WIB');
    expect(preview.rows.find((row) => row.patientName === 'Ahmad')?.confirmedAt).toBe('—');
    expect(preview.summary).toEqual([
      { label: 'Total catatan', value: 2 },
      { label: 'Sudah diminum', value: 1 },
      { label: 'Terlewat', value: 1 },
      { label: 'Belum dikonfirmasi', value: 0 },
    ]);
  });

  it('computes only treatment-day statuses through today or the local completion date', async () => {
    const { service, query } = serviceWith([
      {
        treatmentCourseId: 'course-active', startDate: '2026-10-19', completedAt: null,
        registerNumber: 'REG-1', patientName: 'Siti', adherenceDate: '2026-10-19',
        confirmedAt: '2026-10-18T18:00:00.000Z',
      },
      {
        treatmentCourseId: 'course-complete', startDate: '2026-10-20',
        completedAt: new Date('2026-10-20T17:30:00.000Z'),
        registerNumber: 'REG-2', patientName: 'Ahmad', adherenceDate: null, confirmedAt: null,
      },
    ]);

    const preview = await service.build(
      { category: 'Konfirmasi Minum Obat', from: '2026-10-18', to: '2026-10-23' },
      new Date('2026-10-22T03:00:00.000Z'),
    );

    expect(preview.rows.map((row) => [row.adherenceDate, row.patientName, row.status])).toEqual([
      ['2026-10-22', 'Siti', 'Belum dikonfirmasi'],
      ['2026-10-21', 'Ahmad', 'Terlewat'],
      ['2026-10-21', 'Siti', 'Terlewat'],
      ['2026-10-20', 'Ahmad', 'Terlewat'],
      ['2026-10-20', 'Siti', 'Terlewat'],
      ['2026-10-19', 'Siti', 'Sudah diminum'],
    ]);
    expect(preview.rows.some((row) => row.adherenceDate === '2026-10-23')).toBe(false);
    expect(preview.summary).toEqual([
      { label: 'Total catatan', value: 6 },
      { label: 'Sudah diminum', value: 1 },
      { label: 'Terlewat', value: 4 },
      { label: 'Belum dikonfirmasi', value: 1 },
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("tc.completed_at AT TIME ZONE 'Asia/Jakarta'"), [
      '2026-10-18', '2026-10-23', null,
    ]);
  });

  it('passes the patient filter through to the query', async () => {
    const { service, query } = serviceWith([]);
    const patientId = '123e4567-e89b-12d3-a456-426614174000';
    await service.build({ category: 'Riwayat Kontrol', from: '2026-10-01', to: '2026-10-17', patientId });
    expect(query).toHaveBeenCalledWith(expect.any(String), ['2026-10-01', '2026-10-17', patientId]);
  });

  it('exports a real workbook whose rows match the preview', async () => {
    const { service } = serviceWith([
      {
        registerNumber: 'REG-1', patientName: 'Siti', medicalRecordNumber: 'RM-1', address: 'Jl. A',
        dateOfBirth: '1990-01-01', gender: 'Perempuan', phone: '0812', treatmentStage: 'Bulan ke-2',
        startDate: '2026-10-01', nextControlDate: '2026-10-28', active: true,
      },
    ]);

    const { filename, buffer } = await service.export({ category: 'Data Pasien', from: '2026-10-01', to: '2026-10-17' });
    expect(filename).toBe('laporan-data-pasien-2026-10-01-2026-10-17.xlsx');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Informasi Laporan', 'Data Pasien']);

    const sheet = workbook.getWorksheet('Data Pasien')!;
    const headers = (sheet.getRow(1).values as Array<string | undefined>).slice(1);
    expect(headers).toContain('Nomor Register');
    expect(headers).not.toContain('NIK');
    expect(sheet.getRow(2).getCell(2).value).toBe('Siti');
  });
});
