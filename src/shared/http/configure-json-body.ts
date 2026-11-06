import type { NestExpressApplication } from '@nestjs/platform-express';

export function configureJsonBody(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: 16_384, inflate: false });
}