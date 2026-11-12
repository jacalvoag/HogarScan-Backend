import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { POSTGRES_POOL } from '../src/shared/database/postgres-pool.token.js';
import { configureJsonBody } from '../src/shared/http/configure-json-body.js';
import { createHttpTestModule } from './helpers/create-http-test-module.js';

describe('Evaluation rate limits (e2e)', () => {
  let app: NestExpressApplication;
  const token = 'A'.repeat(43);
  const query = vi.fn().mockResolvedValue({
    rows: [
      {
        user_id: '6ba63463-9073-43d1-9b60-2fd868798cc0',
        expires_at: new Date(Date.now() + 86_400_000),
        revoked_at: null,
      },
    ],
  });

  beforeAll(async () => {
    const moduleRef = await createHttpTestModule({ imports: [AppModule] })
      .overrideProvider(POSTGRES_POOL)
      .useValue({ query })
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

  it('enforces independent limits and runs throttling before session verification', async () => {
    for (let count = 0; count < 599; count++) {
      await request(app.getHttpServer())
        .post('/evaluations')
        .set('Authorization', `Bearer ${token}`)
        .send({ probes: [{ port: 22, outcome: 'TIMEOUT' }] })
        .expect(200);
    }
    expect(query).toHaveBeenCalledTimes(599);

    for (let count = 0; count < 60; count++) {
      await request(app.getHttpServer()).get('/rules').expect(200);
    }
    await request(app.getHttpServer())
      .get('/rules')
      .expect(429)
      .expect('Retry-After', /\d+/)
      .expect('Cache-Control', 'no-store')
      .expect({ code: 'RATE_LIMITED', message: 'Inténtalo más tarde.' });
    expect(query).toHaveBeenCalledTimes(599);
    await request(app.getHttpServer())
      .post('/evaluations')
      .set('Authorization', `Bearer ${token}`)
      .send({ probes: [{ port: 22, outcome: 'TIMEOUT' }] })
      .expect(200);
    expect(query).toHaveBeenCalledTimes(600);
    await request(app.getHttpServer())
      .post('/evaluations')
      .set('Authorization', `Bearer ${token}`)
      .send({ probes: [{ port: 22, outcome: 'TIMEOUT' }] })
      .expect(429)
      .expect('Retry-After', /\d+/)
      .expect('Cache-Control', 'no-store')
      .expect({ code: 'RATE_LIMITED', message: 'Inténtalo más tarde.' });
    expect(query).toHaveBeenCalledTimes(600);
  }, 90_000);
});
