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

/** Validates an optional `YYYY-MM-DD` date, returning null when omitted. */
export function optionalDate(value: unknown, name: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  return requiredDate(value, name);
}

/** Validates an optional value against a fixed set of allowed choices. */
export function optionalChoice(value: unknown, name: string, allowed: readonly string[]): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !allowed.includes(value.trim())) {
    throw new BadRequestException(`${name} tidak valid.`);
  }
  return value.trim();
}

/** Validates an optional phone number (digits with common separators). */
export function optionalPhone(value: unknown, name: string, maxLength = 32): string | null {
  const phone = optionalString(value, name, maxLength);
  if (phone === null) return null;
  if (!/^[0-9+()\-\s]{6,32}$/.test(phone)) {
    throw new BadRequestException(`${name} tidak valid.`);
  }
  return phone;
}
