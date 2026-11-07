import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { SessionGuard } from '../src/modules/auth/auth.public.js';
import type { AuthenticatedRequest } from '../src/modules/auth/auth.public.js';
import { SESSION_VERIFIER } from '../src/modules/auth/application/ports/session-verifier.port.js';
import type { SessionVerifier } from '../src/modules/auth/application/ports/session-verifier.port.js';

@Controller('__test-session')
@UseGuards(SessionGuard)
class SessionFixturesController {
  @Get()
  current(@Req() req: AuthenticatedRequest) {
    return req.identity;
  }
}

describe('Session guard (e2e)', () => {
  let app: NestExpressApplication;
  const token = 'A'.repeat(43);
  const identity = { userId: '6ba63463-9073-43d1-9b60-2fd868798cc0' };
  const verify = vi.fn<SessionVerifier['verify']>();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [SessionFixturesController],
      providers: [
        SessionGuard,
        { provide: SESSION_VERIFIER, useValue: { verify } },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    await app.listen(0);
  });

  beforeEach(() => {
    verify.mockReset();
    verify.mockResolvedValue(null);
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    undefined,
    'Basic credentials',
    'Bearer',
    'Bearer short',
    `Bearer ${'A'.repeat(42)}`,
    `Bearer ${'A'.repeat(44)}`,
    `Bearer ${'A'.repeat(42)}=`,
    `Bearer ${'A'.repeat(21)}.${'A'.repeat(21)}`,
    `Bearer ${token}, Bearer ${token}`,
  ])('rejects a missing or malformed header: %s', async (authorization) => {
    const pendingRequest = request(app.getHttpServer()).get('/__test-session');
    if (authorization !== undefined) {
      pendingRequest.set('Authorization', authorization);
    }

    await pendingRequest
      .expect(401)
      .expect('WWW-Authenticate', 'Bearer')
      .expect('Cache-Control', 'no-store')
      .expect({ code: 'UNAUTHENTICATED', message: 'Inicia sesión de nuevo.' });
    expect(verify).not.toHaveBeenCalled();
  });

  it.each(['Bearer', 'bearer', 'BEARER'])(
    '%s exposes only the verified identity',
    async (scheme) => {
      verify.mockResolvedValueOnce(identity);

      await request(app.getHttpServer())
        .get('/__test-session')
        .set('Authorization', `${scheme} ${token}`)
        .expect(200)
        .expect(identity);
      expect(verify).toHaveBeenCalledExactlyOnceWith(token);
    },
  );

  it('rejects a session that the verifier does not accept', async () => {
    await request(app.getHttpServer())
      .get('/__test-session')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(verify).toHaveBeenCalledExactlyOnceWith(token);
  });

  it('rejects duplicate Authorization headers before verification', async () => {
    await request(app.getHttpServer())
      .get('/__test-session')
      .set({ Authorization: [`Bearer ${token}`, `Bearer ${token}`] })
      .expect(401);
    expect(verify).not.toHaveBeenCalled();
  });

  it('does not accept a token from the query string', async () => {
    await request(app.getHttpServer())
      .get('/__test-session')
      .query({ access_token: token })
      .expect(401);
    expect(verify).not.toHaveBeenCalled();
  });

  it('preserves an unexpected verifier failure as a sanitized HTTP 500', async () => {
    verify.mockRejectedValueOnce(new Error('PRIVATE_SESSION_STORE_ERROR'));

    await request(app.getHttpServer())
      .get('/__test-session')
      .set('Authorization', `Bearer ${token}`)
      .expect(500)
      .expect({
        code: 'INTERNAL_ERROR',
        message: 'No se pudo completar la solicitud.',
      });
  });
});