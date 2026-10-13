import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() body: { username: string; password: string }) {
    if (typeof body?.username !== 'string' || !body.username.trim() || body.username.length > 80 ||
        typeof body?.password !== 'string' || !body.password) {
      throw new BadRequestException('Username dan password wajib diisi.');
    }
    return this.auth.login(body.username.trim(), body.password);
  }
}
