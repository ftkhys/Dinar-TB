import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { ControlAlertsController } from './control-alerts.controller';

describe('ControlAlertsController route', () => {
  it('registers one staff-guarded alert route at GET /control-alerts', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ControlAlertsController)).toBe('/');
    expect(Reflect.getMetadata(PATH_METADATA, ControlAlertsController.prototype.list)).toBe('control-alerts');
    expect(Reflect.getMetadata(METHOD_METADATA, ControlAlertsController.prototype.list)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata('__guards__', ControlAlertsController)).toHaveLength(1);
  });
});
