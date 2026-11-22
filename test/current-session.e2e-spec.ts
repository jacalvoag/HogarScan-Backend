import { ThrottlerGuard } from '@nestjs/throttler';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { CURRENT_SESSION_STORE } from '../src/modules/auth/application/ports/current-session-store.port.js';
import type { CurrentSessionStore } from '../src/modules/auth/application/ports/current-session-store.port.js';
import type { SessionRecord } from '../src/modules/auth/application/ports/session-reader.port.js';
import { Sha256SessionTokenHasher } from '../src/modules/auth/infrastructure/crypto/sha256-session-token-hasher.js';
import { PostgresSessionReader } from '../src/modules/auth/infrastructure/persistence/postgres-session-reader.js';
import { configureJsonBody } from '../src/shared/http/configure-json-body.js';
import { createHttpTestModule } from './helpers/create-http-test-module.js';

describe('Current session (e2e)', () => {
  let app: NestExpressApplication;
  const hasher = new Sha256SessionTokenHasher();
  const token = 'A'.repeat(43);
  const secondToken = 'B'.repeat(43);
  const otherToken = 'C'.repeat(43);

  const user = {
    id: '6ba63463-9073-43d1-9b60-2fd868798cc0',
    email: 'persona@example.com',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const otherUser = {
    ...user,
    id: 'ea11b92c-14b4-49ec-8fa3-a817134177f4',
  };

  const expiresAt = new Date('2099-01-01T00:00:00.000Z');
  const records = new Map<string, SessionRecord>();

  const findByTokenHash = vi.fn(
    async (hash: string) => records.get(hash) ?? null,
  );

  const findActive = vi.fn<CurrentSessionStore['findActive']>();
  const revokeActive = vi.fn<CurrentSessionStore['revokeActive']>();

  const unauthenticated = {
    code: 'UNAUTHENTICATED',
    message: 'Inicia sesión de nuevo.',
  };

  async function createApp(rateLimited = false) {
    const builder = createHttpTestModule({ imports: [AppModule] })
      .overrideProvider(PostgresSessionReader)
      .useValue({ findByTokenHash })
      .overrideProvider(CURRENT_SESSION_STORE)
      .useValue({ findActive, revokeActive });

    if (!rateLimited)
      builder
        .overrideGuard(ThrottlerGuard)
        .useValue({ canActivate: () => true });

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
    records.clear();

    for (const [rawToken, userId] of [
      [token, user.id],
      [secondToken, user.id],
      [otherToken, otherUser.id],
    ]) {
      records.set(hasher.hash(rawToken), {
        userId,
        expiresAt,
        revokedAt: null,
      });
    }

    findByTokenHash.mockClear();
    findActive.mockReset();
    revokeActive.mockReset();

    findActive.mockImplementation(async (hash, userId) => {
      const record = records.get(hash);

      if (
        record === undefined ||
        record.userId !== userId ||
        record.revokedAt !== null
      )
        return null;

      return {
        user: userId === user.id ? user : otherUser,
        expiresAt: record.expiresAt,
        summaryGeneration: 7,
      };
    });

    revokeActive.mockImplementation(async (hash, userId) => {
      const record = records.get(hash);

      if (
        record === undefined ||
        record.userId !== userId ||
        record.revokedAt !== null
      )
        return false;

      records.set(hash, { ...record, revokedAt: new Date() });
      return true;
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns only public data for the authenticated user', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .query({ userId: otherUser.id })
      .set('Authorization', `bEaReR   ${token}`)
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect({
        user: {
          id: user.id,
          email: user.email,
          created_at: user.createdAt.toISOString(),
        },
        expires_at: expiresAt.toISOString(),
        summary_generation: 7,
      });

    expect(findActive).toHaveBeenCalledExactlyOnceWith(
      hasher.hash(token),
      user.id,
    );
  });

  it('revokes only the current session and returns an empty body', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(204)
      .expect('Cache-Control', 'no-store');

    expect(response.text).toBe('');
    expect(revokeActive).toHaveBeenCalledExactlyOnceWith(
      hasher.hash(token),
      user.id,
    );

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    for (const validToken of [secondToken, otherToken]) {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);
    }
  });

  describe.each(['me', 'logout'] as const)('%s', (route) => {
    const send = () =>
      route === 'me'
        ? request(app.getHttpServer()).get('/auth/me')
        : request(app.getHttpServer()).post('/auth/logout');

    it('requires an authenticated session', async () => {
      await send()
        .expect(401)
        .expect('WWW-Authenticate', 'Bearer')
        .expect('Cache-Control', 'no-store')
        .expect(unauthenticated);

      expect(findActive).not.toHaveBeenCalled();
      expect(revokeActive).not.toHaveBeenCalled();
    });

    it.each(['missing', 'expired', 'revoked'] as const)(
      'rejects a %s session',
      async (state) => {
        const hash = hasher.hash(token);

        if (state === 'missing') records.delete(hash);
        else
          records.set(hash, {
            userId: user.id,
            expiresAt: state === 'expired' ? new Date(0) : expiresAt,
            revokedAt: state === 'revoked' ? new Date() : null,
          });

        await send()
          .set('Authorization', `Bearer ${token}`)
          .expect(401)
          .expect(unauthenticated);

        expect(findActive).not.toHaveBeenCalled();
        expect(revokeActive).not.toHaveBeenCalled();
      },
    );

    it('rejects a session that becomes unavailable after guard validation', async () => {
      findActive.mockResolvedValueOnce(null);
      revokeActive.mockResolvedValueOnce(false);

      await send()
        .set('Authorization', `Bearer ${token}`)
        .expect(401)
        .expect(unauthenticated);
    });

    it('sanitizes persistence failures', async () => {
      const error = new Error('PRIVATE_DATABASE_DETAILS');
      findActive.mockRejectedValueOnce(error);
      revokeActive.mockRejectedValueOnce(error);

      await send()
        .set('Authorization', `Bearer ${token}`)
        .expect(500)
        .expect('Cache-Control', 'no-store')
        .expect({
          code: 'INTERNAL_ERROR',
          message: 'No se pudo completar la solicitud.',
        });
    });
  });

  it('limits session reads and keeps logout on its own counter', async () => {
    const limitedApp = await createApp(true);

    try {
      for (let index = 0; index < 60; index++) {
        await request(limitedApp.getHttpServer())
          .get('/auth/me')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      }

      await request(limitedApp.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(429)
        .expect('Retry-After', /^\d+$/)
        .expect('Cache-Control', 'no-store')
        .expect({ code: 'RATE_LIMITED', message: 'Inténtalo más tarde.' });

      expect(findActive).toHaveBeenCalledTimes(60);

      await request(limitedApp.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
    } finally {
      await limitedApp.close();
    }
  });
});
