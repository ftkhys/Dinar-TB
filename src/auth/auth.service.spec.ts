import { AuthService } from './auth.service';

describe('AuthService password and token handling', () => {
  const auth = new AuthService({} as never, {} as never);
  const originalSecret = process.env.AUTH_JWT_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.AUTH_JWT_SECRET;
    else process.env.AUTH_JWT_SECRET = originalSecret;
  });

  it('hashes passwords with a per-password salt and verifies them', async () => {
    const first = await auth.hashPassword('example-password');
    const second = await auth.hashPassword('example-password');
    expect(first).not.toBe(second);
    expect(await auth.verifyPassword('example-password', first)).toBe(true);
    expect(await auth.verifyPassword('incorrect-password', first)).toBe(false);
  });

  it('rejects tokens with a changed signature', () => {
    process.env.AUTH_JWT_SECRET = 'a'.repeat(32);
    const token = auth.sign({ sub: 'id', kind: 'staff', username: 'operator' }, 60);
    expect(auth.verify(token).kind).toBe('staff');
    expect(() => auth.verify(`${token.slice(0, -1)}x`)).toThrow();
  });
});
