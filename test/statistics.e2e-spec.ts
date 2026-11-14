import { ThrottlerGuard } from '@nestjs/throttler';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { USER_STATISTICS_READER } from '../src/modules/scan-summaries/application/ports/user-statistics-reader.port.js';
import type {
  UserStatistics,
  UserStatisticsReader,
} from '../src/modules/scan-summaries/application/ports/user-statistics-reader.port.js';
import { POSTGRES_POOL } from '../src/shared/database/postgres-pool.token.js';
import { configureJsonBody } from '../src/shared/http/configure-json-body.js';
import { createHttpTestModule } from './helpers/create-http-test-module.js';

describe('Account statistics (e2e)', () => {
  let app: NestExpressApplication;

  const token = 'A'.repeat(43);
  const userId = '6ba63463-9073-43d1-9b60-2fd868798cc0';
  const read = vi.fn<UserStatisticsReader['read']>();
  const query = vi.fn();

  const session = {
    user_id: userId,
    expires_at: new Date('2099-01-01T00:00:00Z'),
    revoked_at: null,
  };

  const counts = {
    TCP_SERVICE_ACCESSIBLE: 3,
    PROTOCOL_IDENTIFIED: 1,
    PREVENTIVE_REVIEW: 0,
    POSSIBLE_CVE_MATCH: 0,
    INSUFFICIENT_EVIDENCE: 4,
  };

  const statistics: UserStatistics = {
    summaryGeneration: 2,
    generatedAt: new Date('2026-11-10T16:02:00Z'),
    totalScans: 1,
    totalAddressesScanned: 5,
    totalAddressesResponded: 2,
    totalAcceptedServices: 3,
    findingsByCategory: counts,
    recentScans: [
      {
        scanId: '6ce5e6b1-9509-48a7-bc9d-f0f872364726',
        startedAt: new Date('2026-11-10T16:00:00Z'),
        acceptedServices: 3,
        findingsByCategory: counts,
      },
    ],
  };

  const expected = {
    summary_generation: 2,
    generated_at: '2026-11-10T16:02:00.000Z',
    total_scans: 1,
    total_addresses_scanned: 5,
    total_addresses_responded: 2,
    total_accepted_services: 3,
    findings_by_category: counts,
    recent_scans: [
      {
        scan_id: statistics.recentScans[0].scanId,
        started_at: '2026-11-10T16:00:00.000Z',
        accepted_services: 3,
        findings_by_category: counts,
      },
    ],
  };

  const unauthorized = {
    code: 'UNAUTHENTICATED',
    message: 'Inicia sesión de nuevo.',
  };

  const internalError = {
    code: 'INTERNAL_ERROR',
    message: 'No se pudo completar la solicitud.',
  };

  async function createApp(rateLimited = false) {
    const builder = createHttpTestModule({ imports: [AppModule] })
      .overrideProvider(POSTGRES_POOL)
      .useValue({ query })
      .overrideProvider(USER_STATISTICS_READER)
      .useValue({ read });

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
    read.mockReset();
    read.mockResolvedValue(statistics);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the contract response for the token owner and ignores a forged account', async () => {
    await request(app.getHttpServer())
      .get('/me/stats')
      .query({ user_id: 'forged-account', summary_generation: 999 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect(expected);

    expect(read).toHaveBeenCalledExactlyOnceWith(userId);
  });

  it('uses a second authenticated identity when its token is supplied', async () => {
    const secondUser = '94f2b13f-ac41-4ee3-8fe6-782d9cf5283c';

    query.mockResolvedValueOnce({
      rows: [{ ...session, user_id: secondUser }],
    });

    read.mockResolvedValueOnce({
      ...statistics,
      summaryGeneration: 3,
    });

    await request(app.getHttpServer())
      .get('/me/stats')
      .set('Authorization', `Bearer ${'B'.repeat(43)}`)
      .expect(200)
      .expect({ ...expected, summary_generation: 3 });

    expect(read).toHaveBeenCalledExactlyOnceWith(secondUser);
  });

  it('returns zero statistics while preserving the current generation', async () => {
    const zeros = {
      TCP_SERVICE_ACCESSIBLE: 0,
      PROTOCOL_IDENTIFIED: 0,
      PREVENTIVE_REVIEW: 0,
      POSSIBLE_CVE_MATCH: 0,
      INSUFFICIENT_EVIDENCE: 0,
    };

    read.mockResolvedValueOnce({
      ...statistics,
      totalScans: 0,
      totalAddressesScanned: 0,
      totalAddressesResponded: 0,
      totalAcceptedServices: 0,
      findingsByCategory: zeros,
      recentScans: [],
    });

    await request(app.getHttpServer())
      .get('/me/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect({
        ...expected,
        total_scans: 0,
        total_addresses_scanned: 0,
        total_addresses_responded: 0,
        total_accepted_services: 0,
        findings_by_category: zeros,
        recent_scans: [],
      });
  });

  it('rejects an account removed after session verification', async () => {
    read.mockResolvedValueOnce(null);

    await request(app.getHttpServer())
      .get('/me/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
      .expect('WWW-Authenticate', 'Bearer')
      .expect('Cache-Control', 'no-store')
      .expect(unauthorized);
  });

  it.each(['absent', 'malformed', 'unknown', 'expired', 'revoked'] as const)(
    'rejects an %s session before reading statistics',
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

      const pending = request(app.getHttpServer()).get('/me/stats');

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

      expect(read).not.toHaveBeenCalled();
    },
  );

  it('sanitizes statistics storage failures instead of inventing zeros', async () => {
    read.mockRejectedValueOnce(new Error('PRIVATE_DATABASE_DETAILS'));

    await request(app.getHttpServer())
      .get('/me/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(500)
      .expect('Cache-Control', 'no-store')
      .expect(internalError);
  });

  it('does not read statistics when session storage fails', async () => {
    query.mockRejectedValueOnce(new Error('PRIVATE_SESSION_DETAILS'));

    await request(app.getHttpServer())
      .get('/me/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(500)
      .expect('Cache-Control', 'no-store')
      .expect(internalError);

    expect(read).not.toHaveBeenCalled();
  });

  it('projects only public statistics and recent scan fields', async () => {
    const internal = {
      ...statistics,
      userId,
      debug: 'PRIVATE_DATA',
      recentScans: statistics.recentScans.map((scan) => ({
        ...scan,
        address: '192.168.1.10',
        receivedAt: new Date(),
      })),
    };

    read.mockResolvedValueOnce(internal);

    await request(app.getHttpServer())
      .get('/me/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(expected);
  });

  it('limits requests before verifying the session or reading statistics', async () => {
    const limited = await createApp(true);

    try {
      for (let index = 0; index < 60; index++) {
        await request(limited.getHttpServer())
          .get('/me/stats')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      }

      expect(query).toHaveBeenCalledTimes(60);
      expect(read).toHaveBeenCalledTimes(60);

      await request(limited.getHttpServer())
        .get('/me/stats')
        .set('Authorization', `Bearer ${token}`)
        .expect(429)
        .expect('Retry-After', /^\d+$/)
        .expect('Cache-Control', 'no-store')
        .expect({
          code: 'RATE_LIMITED',
          message: 'Inténtalo más tarde.',
        });

      expect(query).toHaveBeenCalledTimes(60);
      expect(read).toHaveBeenCalledTimes(60);
    } finally {
      await limited.close();
    }
  }, 15_000);
});
