import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { Repository } from 'typeorm';
import { PatientDevice } from '../database/entities/patient-device.entity';
import { StaffAccount } from '../database/entities/staff-account.entity';
import { AuthPrincipal, TokenClaims } from './auth.types';

const PASSWORD_N = 131_072;
const PASSWORD_BYTES = 64;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(StaffAccount) private readonly staffAccounts: Repository<StaffAccount>,
    @InjectRepository(PatientDevice) private readonly devices: Repository<PatientDevice>,
  ) {}

  async hashPassword(password: string): Promise<string> {
    return hashPassword(password);
  }

  async verifyPassword(password: string, encoded: string): Promise<boolean> {
    const [scheme, saltText, hashText] = encoded.split('$');
    if (scheme !== 'scrypt' || !saltText || !hashText) return false;
    const expected = Buffer.from(hashText, 'base64url');
    const actual = await derivePassword(password, Buffer.from(saltText, 'base64url'));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  sign(claims: Omit<TokenClaims, 'iat' | 'exp'>, lifetimeSeconds: number): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: TokenClaims = { ...claims, iat: now, exp: now + lifetimeSeconds };
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const unsigned = `${header}.${body}`;
    return `${unsigned}.${this.hmac(unsigned).toString('base64url')}`;
  }

  verify(token: string): TokenClaims {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Token tidak valid.');
    const unsigned = `${parts[0]}.${parts[1]}`;
    const actual = Buffer.from(parts[2], 'base64url');
    const expected = this.hmac(unsigned);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new UnauthorizedException('Token tidak valid.');
    }
    try {
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as TokenClaims;
      if (claims.exp <= Math.floor(Date.now() / 1000) || !claims.sub) {
        throw new UnauthorizedException('Token kedaluwarsa.');
      }
      return claims;
    } catch {
      throw new UnauthorizedException('Token tidak valid.');
    }
  }

  async login(username: string, password: string): Promise<{ accessToken: string }> {
    const account = await this.staffAccounts
      .createQueryBuilder('staff')
      .addSelect('staff.passwordHash')
      .where('staff.username = :username', { username })
      .andWhere('staff.disabledAt IS NULL')
      .getOne();
    if (!account || !(await this.verifyPassword(password, account.passwordHash))) {
      throw new UnauthorizedException('Username atau password tidak sesuai.');
    }
    return {
      accessToken: this.sign({ sub: account.id, kind: 'staff', username: account.username }, 8 * 60 * 60),
    };
  }

  async authenticate(token: string): Promise<AuthPrincipal> {
    const claims = this.verify(token);
    if (claims.kind === 'staff') {
      const account = await this.staffAccounts
        .createQueryBuilder('staff')
        .where('staff.id = :id', { id: claims.sub })
        .andWhere('staff.disabledAt IS NULL')
        .getOne();
      if (!account) throw new UnauthorizedException('Akun petugas tidak aktif.');
      return { kind: 'staff', id: account.id, username: account.username };
    }
    if (claims.kind === 'patient_device') {
      const device = await this.devices
        .createQueryBuilder('device')
        .where('device.id = :id', { id: claims.sub })
        .andWhere('device.deactivatedAt IS NULL')
        .getOne();
      if (!device || device.version !== claims.version) {
        throw new UnauthorizedException('Device tidak aktif atau token sudah kedaluwarsa.');
      }
      return { kind: 'patient_device', id: device.id, patientId: device.patientId, version: device.version };
    }
    throw new UnauthorizedException('Token tidak valid.');
  }

  private hmac(value: string): Buffer {
    const secret = process.env.AUTH_JWT_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32) {
      throw new Error('AUTH_JWT_SECRET harus diatur dengan secret minimal 32 byte.');
    }
    return createHmac('sha256', secret).update(value).digest();
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derivePassword(password, salt);
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, PASSWORD_BYTES, {
      N: PASSWORD_N,
      r: 8,
      p: 1,
      maxmem: 256 * 1024 * 1024,
    }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}
