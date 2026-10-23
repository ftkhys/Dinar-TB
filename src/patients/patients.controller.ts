import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { PatientsService } from './patients.service';
import { parsePagination } from '../common/pagination';

const DIRECTORY_STATUSES = ['Hari Ini', 'Besok', 'Terlambat', 'Mendatang', 'Perlu Konfirmasi'];

@Controller('patients')
@UseGuards(StaffAuthGuard)
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Post()
  create(@Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.patients.create(body, request.user.id);
  }

  @Get()
  findAll(@Query('search') search?: string, @Query('archived') archived?: string) {
    return this.patients.findAll(search, { archivedOnly: archived === 'true' });
  }

  /** Directory projection with active treatment + control schedule (menu Pasien). */
  @Get('directory')
  directory(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    if (status && status !== 'Semua' && !DIRECTORY_STATUSES.includes(status)) {
      throw new BadRequestException('Filter status pasien tidak valid.');
    }
    return this.patients.directory(search, undefined, parsePagination(page ?? '1', pageSize ?? '20')!, status === 'Semua' ? undefined : status);
  }

  /** Archived (soft-deleted) patients, for the restore flow. */
  @Get('archived')
  archived(@Query('search') search?: string) {
    return this.patients.findAll(search, { archivedOnly: true });
  }

  /** Aggregated card stats for the Pasien page. */
  @Get('stats')
  stats() {
    return this.patients.stats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.patients.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown> & { version?: number },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.patients.update(id, body, request.user.id, body.version);
  }

  @Post(':id/archive')
  @UseGuards(AdminGuard)
  archive(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.patients.archive(id, request.user.id);
  }

  @Post(':id/restore')
  @UseGuards(AdminGuard)
  restore(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.patients.restore(id, request.user.id);
  }

  /**
   * Permanently removes an archived patient from every list: hard-deleted when
   * it has no clinical history, otherwise anonymized with the medical record
   * retained de-identified.
   */
  @Delete(':id/permanent')
  @UseGuards(AdminGuard)
  purge(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.patients.purge(id, request.user.id);
  }
}
