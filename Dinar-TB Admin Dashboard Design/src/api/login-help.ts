/**
 * Login-support helpers for the Admin login screen.
 *
 * These are pure so the "show after three consecutive failures" behaviour and
 * the help copy can be unit tested without a DOM. The frontend counter only
 * decides whether to reveal the help link; the authoritative protection against
 * repeated guessing stays on the server (per-username+IP throttle, HTTP 429).
 */

export const FORGOT_PASSWORD_THRESHOLD = 3;

/** The next value of a consecutive-failure counter after one login attempt. */
export function nextFailureCount(current: number, succeeded: boolean): number {
  return succeeded ? 0 : current + 1;
}

/** Whether the "Lupa Password?" help link should be visible. */
export function shouldShowForgotPassword(consecutiveFailures: number): boolean {
  return consecutiveFailures >= FORGOT_PASSWORD_THRESHOLD;
}

export const FORGOT_PASSWORD_HELP = {
  title: "Lupa Password?",
  instruction: "Silakan hubungi Admin untuk membantu mengatur ulang password akun Anda.",
  steps: [
    "Hubungi Admin Dinar-TB di Puskesmas Anda secara langsung.",
    "Sebutkan username akun petugas Anda agar Admin dapat memverifikasi identitas.",
    "Admin akan mengatur ulang password dan memberi password sementara.",
    "Masuk dengan password sementara, lalu buat password baru saat diminta.",
  ],
} as const;

export const TEMP_PASSWORD_NOTICE =
  "Password sementara hanya dapat dipakai sekali. Anda wajib membuat password baru sebelum melanjutkan.";
