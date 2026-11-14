import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import type { Environment } from './config/environment.js';
import { configureJsonBody } from './shared/http/configure-json-body.js';
import { configureTrustedProxy } from './shared/http/configure-trusted-proxy.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  app.enableShutdownHooks();
  configureJsonBody(app);

  const config = app.get<ConfigService<Environment, true>>(ConfigService);

  configureTrustedProxy(
    app,
    config.getOrThrow('TRUST_LOCAL_PROXY', { infer: true }),
  );

  await app.listen(
    config.getOrThrow('PORT', { infer: true }),
    config.getOrThrow('API_HOST', { infer: true }),
  );
}

await bootstrap();
