import { Controller, Get, UseGuards } from '@nestjs/common';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { ControlAlertsService } from './control-alerts.service';

@Controller()
@UseGuards(StaffAuthGuard)
export class ControlAlertsController {
  constructor(private readonly alerts: ControlAlertsService) {}

  @Get('control-alerts')
  list() {
    return this.alerts.list();
  }
}
