import type { NestExpressApplication } from '@nestjs/platform-express';

export function configureTrustedProxy(
  app: NestExpressApplication,
  enabled: boolean,
): void {
  app.set('trust proxy', enabled ? 'loopback' : false);
}
