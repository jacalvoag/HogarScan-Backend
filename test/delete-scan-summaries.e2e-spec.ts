import { ThrottlerGuard } from '@nestjs/throttler';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { SCAN_SUMMARY_DELETER } from '../src/modules/scan-summaries/application/ports/scan-summary-deleter.port.js';
import type { ScanSummaryDeleter } from '../src/modules/scan-summaries/application/ports/scan-summary-deleter.port.js';
import { POSTGRES_POOL } from '../src/shared/database/postgres-pool.token.js';
import { configureJsonBody } from '../src/shared/http/configure-json-body.js';
import { createHttpTestModule } from './helpers/create-http-test-module.js';

describe('Delete scan summaries (e2e)', () => {
  let app: NestExpressApplication;

  const token = 'A'.repeat(43);
  const userId = '6ba63463-9073-43d1-9b60-2fd868798cc0';
  const deleteAll = vi.fn<ScanSummaryDeleter['deleteAll']>();
  const query = vi.fn();

  const session = {
    user_id: userId,
    expires_at: new Date('2099-01-01T00:00:00Z'),
    revoked_at: null,
  };

  const receipt = {
    deletedCount: 2,
    summaryGeneration: 1,
    deletedAt: new Date('2026-11-10T17:00:00Z'),
  };

  const expected = {
    deleted_count: 2,
    summary_generation: 1,
    deleted_at: '2026-11-10T17:00:00.000Z',
  };

  const unauthorized = {
    code: 'UNAUTHENTICATED',
    message: 'Inicia sesión de nuevo.',
  };

  async function createApp(rateLimited = false) {
    const builder = createHttpTestModule({ imports: [AppModule] })
      .overrideProvider(POSTGRES_POOL)
      .useValue({ query })
      .overrideProvider(SCAN_SUMMARY_DELETER)
      .useValue({ deleteAll });

    if (!rateLimited) {
      builder
        .overrideGuard(ThrottlerGuard)
        .useValue({ canActivate: () => true });
    }

    const moduleRef = await builder.compile();

    const instance = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
      rawBody: true,
    });

    configureJsonBody(instance);
    await instance.listen(0);

    return instance;
  }

  beforeAll(async () => {
    app = await createApp();
  });

  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [session] });
    deleteAll.mockReset();
    deleteAll.mockResolvedValue({ status: 'DELETED', receipt });
  });

  afterAll(async () => {
    await app.close();
  });

  it('deletes for the verified account and returns the public receipt', async () => {
    await request(app.getHttpServer())
      .delete('/me/scans?summary_generation=0')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect(expected);

    expect(deleteAll).toHaveBeenCalledExactlyOnceWith(userId, 0);
  });

  it('returns an advanced generation even when no rows were deleted', async () => {
    deleteAll.mockResolvedValueOnce({
      status: 'DELETED',
      receipt: { ...receipt, deletedCount: 0 },
    });

    await request(app.getHttpServer())
      .delete('/me/scans?summary_generation=0')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect({ ...expected, deleted_count: 0 });
  });

  it('accepts a bodyless request with an explicit zero content length', async () => {
    await request(app.getHttpServer())
      .delete('/me/scans?summary_generation=0')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .set('Content-Length', '0')
      .expect(200)
      .expect(expected);
  });

  it('accepts unsigned decimal leading zeros without changing their numeric value', async () => {
    await request(app.getHttpServer())
      .delete('/me/scans?summary_generation=000')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(deleteAll).toHaveBeenCalledExactlyOnceWith(userId, 0);
  });

  it('passes the largest valid generation to storage and sanitizes exhaustion', async () => {
    deleteAll.mockRejectedValueOnce(
      new RangeError('Summary generation exhausted.'),
    );

    await request(app.getHttpServer())
      .delete('/me/scans?summary_generation=2147483647')
      .set('Authorization', `Bearer ${token}`)
      .expect(500)
      .expect({
        code: 'INTERNAL_ERROR',
        message: 'No se pudo completar la solicitud.',
      });

    expect(deleteAll).toHaveBeenCalledExactlyOnceWith(userId, 2_147_483_647);
  });

  it.each([
    '',
    '?summary_generation=',
    '?summary_generation=-1',
    '?summary_generation=%2B0',
    '?summary_generation=0.0',
    '?summary_generation=1e0',
    '?summary_generation=0x0',
    '?summary_generation=%200',
    '?summary_generation=0%20',
    '?summary_generation=0%0A',
    '?summary_generation=2147483648',
    '?summary_generation=NaN',
    '?summary_generation=0&summary_generation=0',
    '?summary_generation=0&%73ummary_generation=1',
    '?summary_generation[]=0',
    '?summary_generation[value]=0',
    '?summary_generation=0&user_id=another-account',
    '?summary_generation=0&__proto__[user_id]=another-account',
  ])('rejects an invalid query before persistence: %s', async (suffix) => {
    await request(app.getHttpServer())
      .delete(`/me/scans${suffix}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400)
      .expect('Cache-Control', 'no-store')
      .expect({
        code: 'INVALID_REQUEST',
        message: 'Revisa los datos enviados.',
      });

    expect(deleteAll).not.toHaveBeenCalled();
  });

  it.each([{}, { user_id: userId }, []])(
    'rejects a JSON body before deleting: %j',
    async (body) => {
      await request(app.getHttpServer())
        .delete('/me/scans?summary_generation=0')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(400);

      expect(deleteAll).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      0,
      'STALE_GENERATION',
      'STALE_SUMMARY_GENERATION',
      'El resumen pertenece a una generación de estadísticas anterior.',
    ],
    [
      2,
      'FUTURE_GENERATION',
      'INVALID_SUMMARY_GENERATION',
      'La generación enviada no es válida.',
    ],
  ] as const)(
    'returns a conflict for generation %s without retrying',
    async (generation, status, code, message) => {
      deleteAll.mockResolvedValueOnce({ status, currentGeneration: 1 });

      await request(app.getHttpServer())
        .delete(`/me/scans?summary_generation=${generation}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(409)
        .expect('Cache-Control', 'no-store')
        .expect({
          code,
          message,
          details: { current_summary_generation: 1 },
        });

      expect(deleteAll).toHaveBeenCalledExactlyOnceWith(userId, generation);
    },
  );

  it('rejects an account removed after session verification', async () => {
    deleteAll.mockResolvedValueOnce({ status: 'ACCOUNT_NOT_FOUND' });

    await request(app.getHttpServer())
      .delete('/me/scans?summary_generation=0')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
      .expect(unauthorized);
  });

  it.each(['absent', 'malformed', 'unknown', 'expired', 'revoked'] as const)(
    'rejects an %s session before deleting',
    async (state) => {
      if (state === 'unknown') {
        query.mockResolvedValueOnce({ rows: [] });
      }

      if (state === 'expired') {
        query.mockResolvedValueOnce({
          rows: [{ ...session, expires_at: new Date(0) }],
        });
      }

      if (state === 'revoked') {
        query.mockResolvedValueOnce({
          rows: [{ ...session, revoked_at: new Date() }],
        });
      }

      const pending = request(app.getHttpServer()).delete(
        '/me/scans?summary_generation=0',
      );

      if (state !== 'absent') {
        pending.set(
          'Authorization',
          state === 'malformed' ? 'Bearer invalid' : `Bearer ${token}`,
        );
      }

      await pending
        .expect(401)
        .expect('WWW-Authenticate', 'Bearer')
        .expect('Cache-Control', 'no-store')
        .expect(unauthorized);

      expect(deleteAll).not.toHaveBeenCalled();
    },
  );

  it('sanitizes storage failures instead of reporting a successful deletion', async () => {
    deleteAll.mockRejectedValueOnce(new Error('PRIVATE_DATABASE_DETAILS'));

    await request(app.getHttpServer())
      .delete('/me/scans?summary_generation=0')
      .set('Authorization', `Bearer ${token}`)
      .expect(500)
      .expect('Cache-Control', 'no-store')
      .expect({
        code: 'INTERNAL_ERROR',
        message: 'No se pudo completar la solicitud.',
      });
  });

  it('rejects unsupported body formats before deleting', async () => {
    await request(app.getHttpServer())
      .delete('/me/scans?summary_generation=0')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'text/plain')
      .send('x')
      .expect(415);

    expect(deleteAll).not.toHaveBeenCalled();
  });

  it('rejects oversized JSON bodies before deleting', async () => {
    await request(app.getHttpServer())
      .delete('/me/scans?summary_generation=0')
      .set('Authorization', `Bearer ${token}`)
      .send({ padding: 'x'.repeat(16_384) })
      .expect(413);

    expect(deleteAll).not.toHaveBeenCalled();
  });

  it('limits requests before checking the session or deleting', async () => {
    const limited = await createApp(true);

    try {
      for (let index = 0; index < 5; index++) {
        await request(limited.getHttpServer())
          .delete('/me/scans?summary_generation=0')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      }

      expect(query).toHaveBeenCalledTimes(5);
      expect(deleteAll).toHaveBeenCalledTimes(5);

      await request(limited.getHttpServer())
        .delete('/me/scans?summary_generation=0')
        .set('Authorization', `Bearer ${token}`)
        .expect(429)
        .expect('Retry-After', /^\d+$/)
        .expect('Cache-Control', 'no-store')
        .expect({
          code: 'RATE_LIMITED',
          message: 'Inténtalo más tarde.',
        });

      expect(query).toHaveBeenCalledTimes(5);
      expect(deleteAll).toHaveBeenCalledTimes(5);
    } finally {
      await limited.close();
    }
  }, 15_000);
});
