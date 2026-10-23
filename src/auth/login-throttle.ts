import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Minimal in-memory login throttle to blunt repeated credential guessing.
 *
 * Scope: per process. A multi-instance deployment must use a shared store
 * (e.g. Redis) for a global limit; this is a safe baseline for the single
 * instance used at launch. Failed attempts are counted per username+IP and
 * cleared on success; the window is a sliding 15 minutes.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const MAX_BUCKETS = 5000;

type Bucket = { count: number; firstAt: number };
const buckets = new Map<string, Bucket>();

export function assertLoginAllowed(key: string): void {
  const bucket = buckets.get(key);
  if (!bucket) return;
  if (Date.now() - bucket.firstAt > WINDOW_MS) {
    buckets.delete(key);
    return;
  }
  if (bucket.count >= MAX_ATTEMPTS) {
    throw new HttpException(
      'Terlalu banyak percobaan masuk gagal. Silakan coba lagi beberapa saat lagi.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.firstAt > WINDOW_MS) {
    buckets.set(key, { count: 1, firstAt: now });
  } else {
    bucket.count += 1;
  }
  if (buckets.size > MAX_BUCKETS) {
    for (const [existingKey, value] of buckets) {
      if (now - value.firstAt > WINDOW_MS) buckets.delete(existingKey);
    }
  }
}

export function clearLoginFailures(key: string): void {
  buckets.delete(key);
}
