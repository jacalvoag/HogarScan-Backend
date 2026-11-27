import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

export function configureSecurityHeaders(app: NestExpressApplication): void {
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      strictTransportSecurity: {
        maxAge: 31_536_000,
        includeSubDomains: false,
      },
    }),
  );
}
