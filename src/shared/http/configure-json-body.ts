import type { NestExpressApplication } from '@nestjs/platform-express';
import { requireJsonContentType } from './require-json-content-type.middleware.js';

export function configureJsonBody(app: NestExpressApplication): void {
  app.use(requireJsonContentType);
  app.useBodyParser('json', { limit: 16_384, inflate: false });
}