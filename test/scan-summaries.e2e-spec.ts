import { ThrottlerGuard } from '@nestjs/throttler';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { SCAN_SUMMARY_WRITER } from '../src/modules/scan-summaries/application/ports/scan-summary-writer.port.js';
import type { ScanSummaryWriter } from '../src/modules/scan-summaries/application/ports/scan-summary-writer.port.js';
import { POSTGRES_POOL } from '../src/shared/database/postgres-pool.token.js';
import { configureJsonBody } from '../src/shared/http/configure-json-body.js';
import { createHttpTestModule } from './helpers/create-http-test-module.js';

describe('Save scan summaries (e2e)', () => {
  let app: NestExpressApplication;

  const token = 'A'.repeat(43);
  const userId = '6ba63463-9073-43d1-9b60-2fd868798cc0';
  const save = vi.fn<ScanSummaryWriter['save']>();
  const query = vi.fn();

  const body = {
    scan_id: '6CE5E6B1-9509-48A7-BC9D-F0F872364726',
    summary_generation: 0,
    started_at: '2026-11-10T16:00:00Z',
    finished_at: '2026-11-10T16:01:00.1Z',
    addresses_scanned: 5,
    addresses_responded: 2,
    accepted_services: 3,
    findings_by_category: {
      TCP_SERVICE_ACCESSIBLE: 3,
      PROTOCOL_IDENTIFIED: 1,
      PREVENTIVE_REVIEW: 0,
      POSSIBLE_CVE_MATCH: 0,
      INSUFFICIENT_EVIDENCE: 4,
    },
  };

  const receipt = {
    scanId: body.scan_id.toLowerCase(),
    summaryGeneration: 0,
    receivedAt: new Date('2026-11-10T16:02:00.000Z'),
    created: true,
  };

  const unauthorized = {
    code: 'UNAUTHENTICATED',
    message: 'Inicia sesión de nuevo.',
  };

  async function createApp(rateLimited = false) {
    const builder = createHttpTestModule({ imports: [AppModule] })
      .overrideProvider(POSTGRES_POOL)
      .useValue({ query })
      .overrideProvider(SCAN_SUMMARY_WRITER)
      .useValue({ save });

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
    save.mockReset();
    save.mockResolvedValue({ status: 'SAVED', receipt });

    query.mockReset();
    query.mockResolvedValue({
      rows: [
        {
          user_id: userId,
          expires_at: new Date('2099-01-01T00:00:00Z'),
          revoked_at: null,
        },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a summary for the authenticated account and returns the contract receipt', async () => {
    await request(app.getHttpServer())
      .post('/me/scans')
      .query({ userId: 'forged-account' })
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201)
      .expect('Cache-Control', 'no-store')
      .expect({
        scan_id: receipt.scanId,
        summary_generation: 0,
        received_at: receipt.receivedAt.toISOString(),
        created: true,
      });

    expect(save).toHaveBeenCalledExactlyOnceWith(userId, {
      scanId: receipt.scanId,
      summaryGeneration: 0,
      startedAt: '2026-11-10T16:00:00.000Z',
      finishedAt: '2026-11-10T16:01:00.100Z',
      addressesScanned: 5,
      addressesResponded: 2,
      acceptedServices: 3,
      findingsByCategory: body.findings_by_category,
    });
  });

  it('returns 200 and the original receipt on an identical replay', async () => {
    const original = new Date('2026-11-09T16:02:00.000Z');

    save.mockResolvedValueOnce({
      status: 'SAVED',
      receipt: { ...receipt, receivedAt: original, created: false },
    });

    await request(app.getHttpServer())
      .post('/me/scans')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(200)
      .expect({
        scan_id: receipt.scanId,
        summary_generation: 0,
        received_at: original.toISOString(),
        created: false,
      });
  });

  it.each([
    {
      status: 'CONFLICT' as const,
      code: 'SUMMARY_CONFLICT',
      message: 'La revisión ya existe con un contenido diferente.',
    },
    {
      status: 'STALE_GENERATION' as const,
      code: 'STALE_SUMMARY_GENERATION',
      message:
        'El resumen pertenece a una generación de estadísticas anterior.',
    },
    {
      status: 'FUTURE_GENERATION' as const,
      code: 'INVALID_SUMMARY_GENERATION',
      message: 'La generación enviada no es válida.',
    },
  ])(
    'maps $status to the agreed conflict response',
    async ({ status, code, message }) => {
      if (status === 'CONFLICT') {
        save.mockResolvedValueOnce({ status });
      } else {
        save.mockResolvedValueOnce({ status, currentGeneration: 1 });
      }

      await request(app.getHttpServer())
        .post('/me/scans')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(409)
        .expect('Cache-Control', 'no-store')
        .expect({
          code,
          message,
          ...(status === 'CONFLICT'
            ? {}
            : { details: { current_summary_generation: 1 } }),
        });
    },
  );

  it('rejects an account removed after session verification', async () => {
    save.mockResolvedValueOnce({ status: 'ACCOUNT_NOT_FOUND' });

    await request(app.getHttpServer())
      .post('/me/scans')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(401)
      .expect(unauthorized);
  });

  it.each(['absent', 'malformed', 'unknown', 'expired', 'revoked'] as const)(
    'rejects an %s session before persistence',
    async (state) => {
      if (state === 'unknown') {
        query.mockResolvedValueOnce({ rows: [] });
      }

      if (state === 'expired') {
        query.mockResolvedValueOnce({
          rows: [
            { user_id: userId, expires_at: new Date(0), revoked_at: null },
          ],
        });
      }

      if (state === 'revoked') {
        query.mockResolvedValueOnce({
          rows: [
            {
              user_id: userId,
              expires_at: new Date('2099-01-01T00:00:00Z'),
              revoked_at: new Date(),
            },
          ],
        });
      }

      const pending = request(app.getHttpServer()).post('/me/scans').send(body);

      if (state !== 'absent') {
        pending.set(
          'Authorization',
          state === 'malformed' ? 'Bearer invalid' : `Bearer ${token}`,
        );
      }

      await pending
        .expect(401)
        .expect('WWW-Authenticate', 'Bearer')
        .expect(unauthorized);

      expect(save).not.toHaveBeenCalled();
    },
  );

  it.each([
    { ...body, user_id: userId },
    { ...body, received_at: '2026-11-10T16:02:00Z' },
    { ...body, accepted_services: 13 },
    { ...body, summary_generation: '0' },
    { ...body, started_at: '2026-02-29T12:00:00Z' },
    {
      ...body,
      findings_by_category: { ...body.findings_by_category, EXTRA: 1 },
    },
  ])('rejects invalid HTTP input before saving: %j', async (invalid) => {
    await request(app.getHttpServer())
      .post('/me/scans')
      .set('Authorization', `Bearer ${token}`)
      .send(invalid)
      .expect(400)
      .expect({
        code: 'INVALID_REQUEST',
        message: 'Revisa los datos enviados.',
      });

    expect(save).not.toHaveBeenCalled();
  });

  it('rejects duplicate JSON keys before saving', async () => {
    const raw = JSON.stringify(body).replace(
      '"summary_generation":0',
      '"summary_generation":0,"summary_generation":1',
    );

    await request(app.getHttpServer())
      .post('/me/scans')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(400);

    expect(save).not.toHaveBeenCalled();
  });

  it('sanitizes storage failures instead of reporting a created summary', async () => {
    save.mockRejectedValueOnce(new Error('PRIVATE_DATABASE_DETAILS'));

    await request(app.getHttpServer())
      .post('/me/scans')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(500)
      .expect('Cache-Control', 'no-store')
      .expect({
        code: 'INTERNAL_ERROR',
        message: 'No se pudo completar la solicitud.',
      });
  });

  it('rejects invalid generation metadata instead of exposing it', async () => {
    save.mockResolvedValueOnce({
      status: 'STALE_GENERATION',
      currentGeneration: -1,
    });

    await request(app.getHttpServer())
      .post('/me/scans')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(500)
      .expect({
        code: 'INTERNAL_ERROR',
        message: 'No se pudo completar la solicitud.',
      });
  });

  it('limits requests before checking the session or saving', async () => {
    const limited = await createApp(true);

    try {
      for (let index = 0; index < 60; index++) {
        await request(limited.getHttpServer())
          .post('/me/scans')
          .set('Authorization', `Bearer ${token}`)
          .send(body)
          .expect(201);
      }

      expect(query).toHaveBeenCalledTimes(60);
      expect(save).toHaveBeenCalledTimes(60);

      await request(limited.getHttpServer())
        .post('/me/scans')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(429)
        .expect('Retry-After', /^\d+$/)
        .expect('Cache-Control', 'no-store')
        .expect({
          code: 'RATE_LIMITED',
          message: 'Inténtalo más tarde.',
        });

      expect(query).toHaveBeenCalledTimes(60);
      expect(save).toHaveBeenCalledTimes(60);
    } finally {
      await limited.close();
    }
  }, 15_000);
});
