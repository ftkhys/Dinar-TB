import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import {
  assertRequiredEnv,
  configureTrustProxy,
  LISTEN_HOST,
  resolveCorsOrigins,
} from './common/startup-config';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  // Fail fast with a safe message when a required secret/config is missing.
  assertRequiredEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Only a local reverse proxy may supply forwarded client addresses.
  configureTrustProxy(app);

  const { origins, usingDefaults } = resolveCorsOrigins();
  if (usingDefaults) {
    logger.warn(
      `CORS_ALLOWED_ORIGINS belum diatur; memakai origin pengembangan: ${origins.join(', ')}. ` +
        'Atur origin produksi sebelum peluncuran.',
    );
  }
  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // NOTE: a global ValidationPipe is intentionally NOT enabled yet. It requires
  // `class-validator`/`class-transformer` and DTO classes, and the services
  // still validate their `Record<string, unknown>` payloads by hand. Adding it
  // without DTOs would be a no-op while pulling in new dependencies days before
  // launch. Server-side date/identity rules were hardened directly instead; the
  // global pipe + DTO migration is the documented next step.

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, LISTEN_HOST);
}

void bootstrap();

