import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { POSTGRES_POOL } from '../src/shared/database/postgres-pool.token.js';
import { configureJsonBody } from '../src/shared/http/configure-json-body.js';
import { createHttpTestModule } from './helpers/create-http-test-module.js';

describe('Public routes rate limit (e2e)', () => {
  let app: NestExpressApplication;

  const query = vi.fn();
  const connect = vi.fn();

  beforeEach(async () => {
    query.mockReset();
    query.mockResolvedValue({ rows: [{ ready: 1 }] });
    connect.mockReset();

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

  afterEach(async () => {
    await app.close();
  });

  it.each(['/', '/health/live', '/health/ready'])(
    'limits requests to %s',
    async (path) => {
      for (let i = 0; i < 60; i++) {
        await request(app.getHttpServer()).get(path).expect(200);
      }

      if (path === '/health/ready') {
        expect(query).toHaveBeenCalledTimes(60);
      } else {
        expect(query).not.toHaveBeenCalled();
      }

      await request(app.getHttpServer()).get(path).expect(429);

      if (path === '/health/ready') {
        expect(query).toHaveBeenCalledTimes(60);
      } else {
        expect(query).not.toHaveBeenCalled();
      }
    },
    30_000,
  );
});