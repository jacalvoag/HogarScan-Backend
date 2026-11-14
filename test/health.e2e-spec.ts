import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { POSTGRES_POOL } from '../src/shared/database/postgres-pool.token.js';
import { configureJsonBody } from '../src/shared/http/configure-json-body.js';
import { createHttpTestModule } from './helpers/create-http-test-module.js';

describe('Application health (e2e)', () => {
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

  beforeEach(() => {
    query.mockReset();
    query.mockRejectedValue(new Error('PRIVATE_DATABASE_DETAILS'));
    connect.mockClear();
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

  it('reports readiness after a successful database probe', async () => {
    query.mockResolvedValueOnce({ rows: [{ ready: 1 }] });

    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect({ status: 'ok' });

    expect(query).toHaveBeenCalledExactlyOnceWith({
      text: 'SELECT 1 AS ready',
      query_timeout: 1_000,
    });
  });

  it('returns a sanitized 503 and keeps liveness available after database failure', async () => {
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503)
      .expect('Cache-Control', 'no-store')
      .expect({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Servicio temporalmente no disponible.',
      });

    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect({ status: 'ok' });

    expect(query).toHaveBeenCalledOnce();
  });
});
