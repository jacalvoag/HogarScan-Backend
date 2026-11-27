import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureJsonBody } from '../src/shared/http/configure-json-body.js';
import { configureSecurityHeaders } from '../src/shared/http/configure-security-headers.js';
import { createHttpTestModule } from './helpers/create-http-test-module.js';

describe('HTTP security headers (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await createHttpTestModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
      rawBody: true,
    });
    configureSecurityHeaders(app);
    configureJsonBody(app);
    await app.listen(0);
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['/health/live', 200],
    ['/missing-route', 404],
  ] as const)('protects %s responses', async (path, status) => {
    const response = await request(app.getHttpServer())
      .get(path)
      .expect(status);

    expect(response.headers['content-security-policy']).toBe(
      "default-src 'none';base-uri 'none';form-action 'none';frame-ancestors 'none'",
    );
    expect(response.headers['strict-transport-security']).toBe(
      'max-age=31536000',
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('protects malformed request responses', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400)
      .expect('X-Content-Type-Options', 'nosniff')
      .expect('Strict-Transport-Security', 'max-age=31536000');
  });
});
