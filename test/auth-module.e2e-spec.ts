import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import {
  AuthModule,
  CurrentIdentity,
  SessionGuard,
} from '../src/modules/auth/auth.public.js';
import type { AuthenticatedIdentity } from '../src/modules/auth/auth.public.js';
import { POSTGRES_POOL } from '../src/shared/database/postgres-pool.token.js';
import { createHttpTestModule } from './helpers/create-http-test-module.js';

// Este controlador solo existe en las pruebas.
@Controller('__test-auth-module')
@UseGuards(SessionGuard)
class AuthModuleFixturesController {
  @Get()
  current(@CurrentIdentity() identity: AuthenticatedIdentity) {
    return identity;
  }
}

@Module({
  imports: [AuthModule],
  controllers: [AuthModuleFixturesController],
})
class AuthConsumerModule {}

describe('AuthModule integration (e2e)', () => {
  let app: NestExpressApplication;

  const token = 'A'.repeat(43);
  const tokenHash =
    '0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a';

  const row = {
    user_id: '6ba63463-9073-43d1-9b60-2fd868798cc0',
    expires_at: new Date(Date.now() + 86_400_000),
    revoked_at: null,
  };

  const query =
    vi.fn<(sql: string, values: unknown[]) => Promise<{ rows: unknown[] }>>();

  beforeAll(async () => {
    const moduleRef = await createHttpTestModule({
      imports: [AppModule, AuthConsumerModule],
    })
      .overrideProvider(POSTGRES_POOL)
      .useValue({ query })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });

    await app.listen(0);
  });

  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [row] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('resolves the exported guard and queries by the token hash', async () => {
    await request(app.getHttpServer())
      .get('/__test-auth-module')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect({ userId: row.user_id });

    expect(query).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('WHERE token_hash = $1'),
      [tokenHash],
    );
  });

  it.each([
    { state: 'missing', rows: [] },
    { state: 'expired', rows: [{ ...row, expires_at: new Date(0) }] },
    { state: 'revoked', rows: [{ ...row, revoked_at: new Date() }] },
  ])('rejects a $state session', async ({ rows }) => {
    query.mockResolvedValueOnce({ rows });

    await request(app.getHttpServer())
      .get('/__test-auth-module')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
      .expect('WWW-Authenticate', 'Bearer')
      .expect('Cache-Control', 'no-store')
      .expect({
        code: 'UNAUTHENTICATED',
        message: 'Inicia sesión de nuevo.',
      });
  });

  it('rejects a missing bearer token without querying PostgreSQL', async () => {
    await request(app.getHttpServer()).get('/__test-auth-module').expect(401);

    expect(query).not.toHaveBeenCalled();
  });

  it('sanitizes a database failure as HTTP 500', async () => {
    query.mockRejectedValueOnce(new Error('PRIVATE_DATABASE_DETAILS'));

    await request(app.getHttpServer())
      .get('/__test-auth-module')
      .set('Authorization', `Bearer ${token}`)
      .expect(500)
      .expect({
        code: 'INTERNAL_ERROR',
        message: 'No se pudo completar la solicitud.',
      });
  });
});
