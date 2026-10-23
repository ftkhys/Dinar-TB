import { BadRequestException, Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { assertLoginAllowed, clearLoginFailures, recordLoginFailure } from './login-throttle';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: { username: string; password: string }, @Req() request: Request) {
    if (typeof body?.username !== 'string' || !body.username.trim() || body.username.length > 80 ||
        typeof body?.password !== 'string' || !body.password) {
      throw new BadRequestException('Username dan password wajib diisi.');
    }
    const username = body.username.trim();
    const throttleKey = `${username.toLowerCase()}|${request.ip ?? 'unknown'}`;
    assertLoginAllowed(throttleKey);
    try {
      const result = await this.auth.login(username, body.password);
      clearLoginFailures(throttleKey);
      return result;
    } catch (error) {
      recordLoginFailure(throttleKey);
      throw error;
    }
  }
}
