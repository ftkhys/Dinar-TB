import { BadRequestException } from '@nestjs/common';

export function requiredString(value: unknown, name: string, maxLength = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new BadRequestException(`${name} wajib diisi dan maksimal ${maxLength} karakter.`);
  }
  return value.trim();
}

export function optionalString(value: unknown, name: string, maxLength = 2000): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw new BadRequestException(`${name} tidak valid.`);
  }
  return value.trim() || null;
}

export function requiredDate(value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(`${name} harus berformat YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${name} bukan tanggal kalender yang valid.`);
  }
  return value;
}
