import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(StaffAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('preview')
  preview(
    @Query('category') category: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('patientId') patientId?: string,
  ) {
    return this.reports.build({ category, from, to, patientId });
  }

  @Get('export.xlsx')
  async export(
    @Res() response: Response,
    @Query('category') category: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('patientId') patientId?: string,
  ): Promise<void> {
    const { filename, buffer } = await this.reports.export({ category, from, to, patientId });
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.setHeader('Content-Length', buffer.length);
    response.end(buffer);
  }
}
