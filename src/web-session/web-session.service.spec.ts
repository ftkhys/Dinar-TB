import {
  readCookie,
  webSessionCookieOptions,
  webSessionTtlDays,
} from './web-session.service';

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe('web session helpers', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSecure = process.env.WEB_COOKIE_SECURE;
  const originalTtl = process.env.WEB_SESSION_TTL_DAYS;

  afterEach(() => {
    restoreEnv('NODE_ENV', originalNodeEnv);
    restoreEnv('WEB_COOKIE_SECURE', originalSecure);
    restoreEnv('WEB_SESSION_TTL_DAYS', originalTtl);
  });

  it('uses an HttpOnly, SameSite=Lax cookie on the site root', () => {
    const expires = new Date('2026-11-01T00:00:00.000Z');
    const options = webSessionCookieOptions(expires);
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires,
    });
  });

  it('always marks the cookie Secure in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.WEB_COOKIE_SECURE = 'false';
    expect(webSessionCookieOptions().secure).toBe(true);
  });

  it('allows non-Secure cookies only outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.WEB_COOKIE_SECURE = 'false';
    expect(webSessionCookieOptions().secure).toBe(false);
    process.env.WEB_COOKIE_SECURE = 'true';
    expect(webSessionCookieOptions().secure).toBe(true);
  });

  it('clamps session TTL to 1-30 days and falls back to 7', () => {
    process.env.WEB_SESSION_TTL_DAYS = '0';
    expect(webSessionTtlDays()).toBe(1);
    process.env.WEB_SESSION_TTL_DAYS = '90';
    expect(webSessionTtlDays()).toBe(30);
    process.env.WEB_SESSION_TTL_DAYS = 'not-a-number';
    expect(webSessionTtlDays()).toBe(7);
    process.env.WEB_SESSION_TTL_DAYS = '14.9';
    expect(webSessionTtlDays()).toBe(14);
  });

  it('reads the session cookie from a Cookie header', () => {
    expect(
      readCookie(
        'theme=dark; dinar_web_session=abc123; other=1',
        'dinar_web_session',
      ),
    ).toBe('abc123');
    expect(readCookie('theme=dark', 'dinar_web_session')).toBeNull();
    expect(readCookie(undefined, 'dinar_web_session')).toBeNull();
  });
});
