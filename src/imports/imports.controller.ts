import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { ImportsService } from './imports.service';

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

type UploadedFileLike = { originalname?: string; mimetype?: string; size?: number; buffer?: Buffer };

@Controller('imports/patients')
@UseGuards(StaffAuthGuard)
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get('template')
  async template(@Res() response: Response): Promise<void> {
    const { filename, buffer } = await this.imports.buildTemplate();
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.setHeader('Content-Length', buffer.length);
    response.end(buffer);
  }

  @Post('validate')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES } }))
  validate(@UploadedFile() file?: UploadedFileLike) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Pilih berkas Excel (.xlsx) terlebih dahulu.');
    }
    return this.imports.preview({ buffer: file.buffer, originalname: file.originalname, size: file.size });
  }

  @Post('confirm')
  confirm(@Body() body: { rows?: unknown }, @Req() request: AuthenticatedRequest) {
    return this.imports.confirm(body?.rows, request.user.id);
  }
}
