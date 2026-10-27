import { Request } from 'express';

/** The only two staff roles. `Admin` manages accounts and shared settings. */
export const STAFF_ROLES = ['Admin', 'Petugas'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value);
}

export function asStaffRole(value: unknown): StaffRole {
  return isStaffRole(value) ? value : 'Petugas';
}

export type StaffPrincipal = {
  kind: 'staff';
  id: string;
  username: string;
  role: StaffRole;
  /** True when the account still holds an Admin-issued temporary password. */
  mustChangePassword: boolean;
};
export type DevicePrincipal = { kind: 'patient_device'; id: string; patientId: string; version: number };
export type AuthPrincipal = StaffPrincipal | DevicePrincipal;
export type AuthenticatedRequest = Request & { user: AuthPrincipal };

/** Browser session principal. Never returned by the staff/device JWT auth. */
export type WebSessionPrincipal = {
  kind: 'patient_web';
  /** `patient_web_sessions.id`, used for logout and push ownership. */
  id: string;
  patientId: string;
  patient: { id: string; fullName: string; registerNumber: string };
  expiresAt: Date;
};
export type WebAuthenticatedRequest = Request & { webSession: WebSessionPrincipal };

export interface TokenClaims {
  sub: string;
  kind: 'staff' | 'patient_device';
  username?: string;
  patientId?: string;
  version?: number;
  /** Staff only: HMAC marker bound to the current password hash. */
  pwv?: string;
  iat: number;
  exp: number;
}
