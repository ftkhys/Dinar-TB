import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { PatientsService } from './patients.service';

@Controller('patients')
@UseGuards(StaffAuthGuard)
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Post()
  create(@Body() body: Record<string, unknown>, @Req() request: AuthenticatedRequest) {
    return this.patients.create(body, request.user.id);
  }

  @Get()
  findAll(@Query('search') search?: string) {
    return this.patients.findAll(search);
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
}
