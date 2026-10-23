import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ApiError, ControlApi, isTokenExpired, loginStaff } from "../api/control-api";

type StaffAuthStatus = "anonymous" | "authenticating" | "authenticated";

export type StaffAuth = {
  accessToken: string | null;
  username: string | null;
  status: StaffAuthStatus;
  /** True when the account must replace an Admin-issued temporary password. */
  mustChangePassword: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  /** Called after a successful password change to clear the requirement. */
  markPasswordChanged: () => void;
  /** Syncs the requirement from the server (e.g. GET /staff/me). */
  requirePasswordChange: () => void;
};

const StaffAuthContext = createContext<StaffAuth | null>(null);

const SESSION_KEY = "dinar-tb.staff-session";

type StoredSession = { accessToken: string; username: string };

/**
 * Reads the session token from `sessionStorage` so a page reload keeps the
 * officer signed in for the duration of the tab. The token is dropped when it
 * is expired or malformed. Storing a bearer token in browser-accessible storage
 * carries an XSS risk: any script running on the origin could read it. This is
 * accepted for the current Bearer architecture (no cookie/CSRF surface) and the
 * backend still validates every request, so a revoked/expired token fails fast.
 */
function readStoredSession(): StoredSession | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed.accessToken !== "string" || typeof parsed.username !== "string") return null;
    if (isTokenExpired(parsed.accessToken)) {
      globalThis.sessionStorage?.removeItem(SESSION_KEY);
      return null;
    }
    return { accessToken: parsed.accessToken, username: parsed.username };
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredSession): void {
  try {
    globalThis.sessionStorage?.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* storage unavailable (private mode) — session stays in memory only */
  }
}

function clearStoredSession(): void {
  try {
    globalThis.sessionStorage?.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(readStoredSession);
  const [accessToken, setAccessToken] = useState<string | null>(initial?.accessToken ?? null);
  const [username, setUsername] = useState<string | null>(initial?.username ?? null);
  const [status, setStatus] = useState<StaffAuthStatus>(initial ? "authenticated" : "anonymous");
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const logout = useCallback(() => {
    clearStoredSession();
    setAccessToken(null);
    setUsername(null);
    setStatus("anonymous");
    setMustChangePassword(false);
  }, []);

  const markPasswordChanged = useCallback(() => setMustChangePassword(false), []);
  const requirePasswordChange = useCallback(() => setMustChangePassword(true), []);

  const login = useCallback(async (user: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    setStatus("authenticating");
    try {
      const result = await loginStaff(user, password);
      writeStoredSession({ accessToken: result.accessToken, username: user });
      setAccessToken(result.accessToken);
      setUsername(user);
      setMustChangePassword(result.mustChangePassword === true);
      setStatus("authenticated");
      return { ok: true };
    } catch (error) {
      setStatus("anonymous");
      return { ok: false, error: error instanceof ApiError ? error.message : "Gagal masuk. Coba lagi." };
    }
  }, []);

  const value = useMemo<StaffAuth>(
    () => ({ accessToken, username, status, mustChangePassword, login, logout, markPasswordChanged, requirePasswordChange }),
    [accessToken, username, status, mustChangePassword, login, logout, markPasswordChanged, requirePasswordChange],
  );

  return <StaffAuthContext.Provider value={value}>{children}</StaffAuthContext.Provider>;
}

export function useStaffAuth(): StaffAuth {
  const context = useContext(StaffAuthContext);
  if (!context) throw new Error("useStaffAuth harus dipakai di dalam StaffAuthProvider.");
  return context;
}

/** Token-only accessor kept for callers that only need the bearer value. */
export function useStaffAccessToken(): string | null {
  return useStaffAuth().accessToken;
}

/**
 * ControlApi bound to the session token. A 401 from any staff endpoint clears
 * the session so the login screen is shown again (expired/revoked token).
 */
export function useControlApi(): ControlApi {
  const { accessToken, logout } = useStaffAuth();
  return useMemo(
    () => new ControlApi(accessToken, { onUnauthorized: () => logout() }),
    [accessToken, logout],
  );
}
