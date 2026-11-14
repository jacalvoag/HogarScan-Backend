import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { POSTGRES_POOL } from '../src/shared/database/postgres-pool.token.js';
import { configureJsonBody } from '../src/shared/http/configure-json-body.js';
import { createHttpTestModule } from './helpers/create-http-test-module.js';

describe('Application liveness (e2e)', () => {
  let app: NestExpressApplication;

  const query = vi.fn().mockRejectedValue(new Error('Database unavailable'));
  const connect = vi.fn().mockRejectedValue(new Error('Database unavailable'));

  beforeAll(async () => {
    const moduleRef = await createHttpTestModule({ imports: [AppModule] })
      .overrideProvider(POSTGRES_POOL)
      .useValue({ query, connect })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
      rawBody: true,
    });

    configureJsonBody(app);
    await app.listen(0);
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds without authentication or database access and prevents caching', async () => {
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect({ status: 'ok' });

    expect(query).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });
});
