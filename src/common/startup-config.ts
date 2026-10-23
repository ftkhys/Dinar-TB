/**
 * Startup configuration guards.
 *
 * These run before the HTTP server starts so a misconfigured deployment fails
 * fast with a safe message instead of accepting traffic with a missing secret.
 * No secret value is ever included in an error or log line.
 */

/** The backend is only reachable through the local reverse proxy. */
export const LISTEN_HOST = '127.0.0.1';

/** Client addresses are forwarded only by the local Nginx instance. */
export const TRUSTED_PROXY_RANGES = ['127.0.0.1/32', '::1/128'] as const;

type TrustProxyTarget = {
  set(setting: string, value: unknown): unknown;
};

export function configureTrustProxy(app: TrustProxyTarget): void {
  app.set('trust proxy', [...TRUSTED_PROXY_RANGES]);
}

const MIN_SECRET_BYTES = 32;

const PLACEHOLDER_SECRET_PATTERNS = [
  /^replace[-_ ]/i,
  /^change[-_ ]?me/i,
  /^your[-_ ]/i,
  /^example[-_ ]/i,
  /^sample[-_ ]/i,
  /^(secret|password|changeme|example)$/i,
  /^replace_with_a_long_random_secret$/i,
];

function isUnsafeSecret(secret: string): boolean {
  const normalized = secret.trim();
  return PLACEHOLDER_SECRET_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    /^(.)\1+$/.test(normalized);
}

/** Development origins used when CORS_ALLOWED_ORIGINS is not configured. */
const DEFAULT_DEV_ORIGINS = ['http://localhost:8443', 'http://localhost:5173'];

export function assertRequiredEnv(env: NodeJS.ProcessEnv = process.env): void {
  const missing: string[] = [];
  const secret = env.AUTH_JWT_SECRET;
  if (!secret) missing.push('AUTH_JWT_SECRET');
  else if (Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) {
    throw new Error(`AUTH_JWT_SECRET harus minimal ${MIN_SECRET_BYTES} byte.`);
  } else if (isUnsafeSecret(secret)) {
    throw new Error('AUTH_JWT_SECRET masih memakai nilai contoh atau tidak aman. Gunakan secret acak.');
  }
  for (const key of ['DB_HOST', 'DB_USERNAME', 'DB_DATABASE']) {
    if (!env[key]) missing.push(key);
  }
  if (missing.length) {
    throw new Error(`Konfigurasi lingkungan wajib belum diatur: ${missing.join(', ')}.`);
  }
}

/**
 * Parses the CORS allowlist. Credentials are always enabled, so a wildcard is
 * rejected outright (wildcard + credentials is invalid per the CORS spec and
 * would expose the API to any origin).
 */
export function resolveCorsOrigins(
  raw: string | undefined = process.env.CORS_ALLOWED_ORIGINS,
): { origins: string[]; usingDefaults: boolean } {
  const configured = (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.includes('*')) {
    throw new Error('CORS_ALLOWED_ORIGINS tidak boleh berisi "*" karena kredensial diaktifkan.');
  }
  if (configured.length) return { origins: configured, usingDefaults: false };
  return { origins: [...DEFAULT_DEV_ORIGINS], usingDefaults: true };
}
