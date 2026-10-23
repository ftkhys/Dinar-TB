import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as express from 'express';
import {
  assertRequiredEnv,
  configureTrustProxy,
  LISTEN_HOST,
  TRUSTED_PROXY_RANGES,
} from './startup-config';

function envWith(secret?: string): NodeJS.ProcessEnv {
  return {
    AUTH_JWT_SECRET: secret,
    DB_HOST: 'localhost',
    DB_USERNAME: 'postgres',
    DB_DATABASE: 'dinar_tb_test',
  };
}

describe('assertRequiredEnv', () => {
  it('accepts a long random secret', () => {
    expect(() => assertRequiredEnv(envWith('u7Jc2ZtQ9wF3sV6mR1kP8xN4aB5dH0yL'))).not.toThrow();
  });

  it('rejects a missing, empty, or short secret', () => {
    expect(() => assertRequiredEnv(envWith())).toThrow(/AUTH_JWT_SECRET/);
    expect(() => assertRequiredEnv(envWith(''))).toThrow(/AUTH_JWT_SECRET/);
    expect(() => assertRequiredEnv(envWith('short-secret'))).toThrow(/minimal 32 byte/);
  });

  it('rejects known placeholder and low-entropy secrets without echoing them', () => {
    const unsafe = [
      'replace_with_a_long_random_secret',
      'change_me_to_a_long_random_value_now',
      'your-super-secret-value-that-is-long',
      'example-secret-value-that-is-long-enough',
      'a'.repeat(40),
    ];

    for (const secret of unsafe) {
      let message = '';
      try {
        assertRequiredEnv(envWith(secret));
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toMatch(/tidak aman|minimal 32 byte/);
      expect(message).not.toContain(secret);
    }
  });

  it('lists missing database configuration without exposing values', () => {
    const env = envWith('u7Jc2ZtQ9wF3sV6mR1kP8xN4aB5dH0yL');
    delete env.DB_HOST;
    delete env.DB_USERNAME;
    delete env.DB_DATABASE;

    expect(() => assertRequiredEnv(env)).toThrow('DB_HOST, DB_USERNAME, DB_DATABASE');
  });
});

describe('network trust configuration', () => {
  it('binds the backend to loopback only', () => {
    expect(LISTEN_HOST).toBe('127.0.0.1');
  });

  it('trusts forwarded addresses only from loopback proxies', () => {
    expect([...TRUSTED_PROXY_RANGES]).toEqual(['127.0.0.1/32', '::1/128']);
  });

  describe('request.ip behind the local reverse proxy', () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
      const app = express();
      configureTrustProxy(app);
      app.get('/ip', (request, response) => {
        response.json({ ip: request.ip });
      });
      server = app.listen(0, LISTEN_HOST);
      await once(server, 'listening');
      const address = server.address() as AddressInfo;
      baseUrl = `http://${LISTEN_HOST}:${address.port}`;
    });

    afterAll(async () => {
      server.close();
      await once(server, 'close');
    });

    it('uses the client address appended by Nginx, not a spoofed leftmost value', async () => {
      const response = await fetch(`${baseUrl}/ip`, {
        headers: { 'X-Forwarded-For': '203.0.113.50, 198.51.100.25' },
      });

      expect(await response.json()).toEqual({ ip: '198.51.100.25' });
    });

    it('uses the direct socket address when no proxy header is present', async () => {
      const response = await fetch(`${baseUrl}/ip`);

      expect(await response.json()).toEqual({ ip: LISTEN_HOST });
    });
  });
});
