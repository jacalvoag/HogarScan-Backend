import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import type { Environment } from './config/environment.js';
import { configureJsonBody } from './shared/http/configure-json-body.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  configureJsonBody(app);

  const config = app.get<ConfigService<Environment, true>>(ConfigService);
  await app.listen(config.getOrThrow('PORT', { infer: true }));
}
await bootstrap();