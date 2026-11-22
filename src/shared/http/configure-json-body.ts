import type { NestExpressApplication } from '@nestjs/platform-express';
import { requireJsonContentType } from './require-json-content-type.middleware.js';
import { requireValidUtf8 } from './require-valid-utf8.middleware.js';
import { requireUniqueJsonKeys } from './require-unique-json-keys.middleware.js';

export function configureJsonBody(app: NestExpressApplication): void {
  app.use(requireJsonContentType);
  app.useBodyParser('json', { limit: 16_384, inflate: false });
  app.use(requireValidUtf8);
  app.use(requireUniqueJsonKeys);
}