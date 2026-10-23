import { BadRequestException } from '@nestjs/common';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type PaginationQuery = { page: number; pageSize: number };
export const DEFAULT_PAGINATION: PaginationQuery = { page: 1, pageSize: DEFAULT_PAGE_SIZE };

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function positiveInteger(raw: string | undefined, fallback: number, label: string, max?: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  if (!/^\d+$/.test(raw.trim())) throw new BadRequestException(`${label} harus berupa angka bulat positif.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new BadRequestException(`${label} harus berupa angka bulat positif.`);
  }
  if (max !== undefined && value > max) {
    throw new BadRequestException(`${label} maksimal ${max}.`);
  }
  return value;
}

/**
 * Returns null when the caller did not request pagination, preserving the
 * legacy array response for existing clients (including the Flutter app).
 */
export function parsePagination(
  pageRaw?: string,
  pageSizeRaw?: string,
): PaginationQuery | null {
  const hasPage = pageRaw !== undefined && pageRaw.trim() !== '';
  const hasPageSize = pageSizeRaw !== undefined && pageSizeRaw.trim() !== '';
  if (!hasPage && !hasPageSize) return null;

  return {
    page: positiveInteger(pageRaw, 1, 'Halaman'),
    pageSize: positiveInteger(pageSizeRaw, DEFAULT_PAGE_SIZE, 'Ukuran halaman', MAX_PAGE_SIZE),
  };
}

export function paginate<T>(items: T[], total: number, query: PaginationQuery): Paginated<T> {
  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
  };
}

export function paginationOffset(query: PaginationQuery): number {
  return (query.page - 1) * query.pageSize;
}
