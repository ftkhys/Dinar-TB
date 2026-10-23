import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuditLogService } from '../common/audit-log.service';
import { PatientDevice } from '../database/entities/patient-device.entity';
import { StaffAccount } from '../database/entities/staff-account.entity';
import { AuthPrincipal, TokenClaims, asStaffRole } from './auth.types';

const PASSWORD_N = 131_072;
const PASSWORD_BYTES = 64;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(StaffAccount) private readonly staffAccounts: Repository<StaffAccount>,
    @InjectRepository(PatientDevice) private readonly devices: Repository<PatientDevice>,
    private readonly audit: AuditLogService,
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
    let claims: TokenClaims;
    try {
      claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as TokenClaims;
    } catch {
      throw new UnauthorizedException('Token tidak valid.');
    }
    if (!claims || typeof claims.exp !== 'number' || !claims.sub) {
      throw new UnauthorizedException('Token tidak valid.');
    }
    if (claims.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Token kedaluwarsa.');
    }
    return claims;
  }

  async login(username: string, password: string): Promise<{ accessToken: string; mustChangePassword: boolean }> {
    const account = await this.staffAccounts
      .createQueryBuilder('staff')
      .addSelect('staff.passwordHash')
      .where('staff.username = :username', { username })
      .andWhere('staff.disabledAt IS NULL')
      .getOne();
    if (!account || !(await this.verifyPassword(password, account.passwordHash))) {
      throw new UnauthorizedException('Username atau password tidak sesuai.');
    }
    // One audit row per successful login. The stateless JWT session is minted
    // here, so refreshes and navigation never reach this point and cannot
    // duplicate the activity; failed attempts throw before this line.
    await this.audit.record({
      actorStaffId: account.id,
      objectType: 'staff_account',
      objectId: account.id,
      action: 'login',
    });
    return {
      accessToken: this.sign(
        { sub: account.id, kind: 'staff', username: account.username, pwv: this.passwordVersion(account.passwordHash) },
        8 * 60 * 60,
      ),
      mustChangePassword: account.mustChangePassword === true,
    };
  }

  async authenticate(token: string): Promise<AuthPrincipal> {
    const claims = this.verify(token);
    if (claims.kind === 'staff') {
      const account = await this.staffAccounts
        .createQueryBuilder('staff')
        .addSelect('staff.passwordHash')
        .where('staff.id = :id', { id: claims.sub })
        .andWhere('staff.disabledAt IS NULL')
        .getOne();
      if (!account) throw new UnauthorizedException('Akun petugas tidak aktif.');
      // Invalidate sessions minted before a password change: the token carries
      // a marker derived from the password hash at login time, so a changed
      // password (or a token without the marker) no longer matches.
      if (!claims.pwv || claims.pwv !== this.passwordVersion(account.passwordHash)) {
        throw new UnauthorizedException('Sesi sudah tidak berlaku. Silakan masuk kembali.');
      }
      return { kind: 'staff', id: account.id, username: account.username, role: asStaffRole(account.role), mustChangePassword: account.mustChangePassword === true };
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

  /** Non-reversible marker bound to the account's current password hash. */
  private passwordVersion(passwordHash: string): string {
    return this.hmac(`pwv:${passwordHash}`).toString('base64url');
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
