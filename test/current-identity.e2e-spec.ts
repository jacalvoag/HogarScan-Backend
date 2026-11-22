import { Controller, Get, UseGuards } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import {
  CurrentIdentity,
  SessionGuard,
} from '../src/modules/auth/auth.public.js';
import type { AuthenticatedIdentity } from '../src/modules/auth/auth.public.js';
import type {
  SessionReader,
  SessionRecord,
} from '../src/modules/auth/application/ports/session-reader.port.js';
import { SESSION_VERIFIER } from '../src/modules/auth/application/ports/session-verifier.port.js';
import { VerifySession } from '../src/modules/auth/application/verify-session.js';
import { Sha256SessionTokenHasher } from '../src/modules/auth/infrastructure/crypto/sha256-session-token-hasher.js';
import { createHttpTestModule } from './helpers/create-http-test-module.js';

// Rutas exclusivas de pruebas.
@Controller('__test-identity')
class IdentityFixturesController {
  @Get()
  @UseGuards(SessionGuard)
  current(@CurrentIdentity() identity: AuthenticatedIdentity) {
    return identity;
  }

  @Get('missing-guard')
  missingGuard(@CurrentIdentity() identity: AuthenticatedIdentity) {
    return identity;
  }
}

describe('Current identity and session verification (e2e)', () => {
  let app: NestExpressApplication;
  const token = 'A'.repeat(43);
  const now = new Date('2030-01-01T00:00:00.000Z');
  const session: SessionRecord = {
    userId: '6ba63463-9073-43d1-9b60-2fd868798cc0',
    expiresAt: new Date('2030-01-02T00:00:00.000Z'),
    revokedAt: null,
  };
  const findByTokenHash = vi.fn<SessionReader['findByTokenHash']>();

  beforeAll(async () => {
    const moduleRef = await createHttpTestModule({
      imports: [AppModule],
      controllers: [IdentityFixturesController],
      providers: [
        SessionGuard,
        {
          provide: SESSION_VERIFIER,
          useFactory: () =>
            new VerifySession(
              { findByTokenHash },
              new Sha256SessionTokenHasher(),
              () => now,
            ),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    await app.listen(0);
  });

  beforeEach(() => {
    findByTokenHash.mockReset();
    findByTokenHash.mockResolvedValue(session);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the verified user and ignores a user id from the client', async () => {
    await request(app.getHttpServer())
      .get('/__test-identity')
      .set('Authorization', `Bearer ${token}`)
      .query({ userId: 'forged-user' })
      .expect(200)
      .expect({ userId: session.userId });
  });

  it.each([
    null,
    { ...session, expiresAt: new Date('2029-12-31T23:59:59.999Z') },
    { ...session, expiresAt: now },
    { ...session, revokedAt: now },
  ])(
    'rejects an unavailable, expired or revoked session: %j',
    async (record) => {
      findByTokenHash.mockResolvedValueOnce(record);

      await request(app.getHttpServer())
        .get('/__test-identity')
        .set('Authorization', `Bearer ${token}`)
        .expect(401)
        .expect('WWW-Authenticate', 'Bearer')
        .expect('Cache-Control', 'no-store')
        .expect({
          code: 'UNAUTHENTICATED',
          message: 'Inicia sesión de nuevo.',
        });
    },
  );

  it('rejects access when no guard has established the identity', async () => {
    await request(app.getHttpServer())
      .get('/__test-identity/missing-guard')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(findByTokenHash).not.toHaveBeenCalled();
  });
});
