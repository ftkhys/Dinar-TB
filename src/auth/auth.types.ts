import { Request } from 'express';

export type StaffPrincipal = { kind: 'staff'; id: string; username: string };
export type DevicePrincipal = { kind: 'patient_device'; id: string; patientId: string; version: number };
export type AuthPrincipal = StaffPrincipal | DevicePrincipal;
export type AuthenticatedRequest = Request & { user: AuthPrincipal };

export interface TokenClaims {
  sub: string;
  kind: 'staff' | 'patient_device';
  username?: string;
  patientId?: string;
  version?: number;
  iat: number;
  exp: number;
}
