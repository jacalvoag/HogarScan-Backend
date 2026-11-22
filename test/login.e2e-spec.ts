import { createHash } from 'node:crypto';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { authConfig } from '../src/config/auth.config.js';
import { PASSWORD_HASHER } from '../src/modules/auth/application/ports/password-hasher.port.js';
import { Argon2PasswordHasher } from '../src/modules/auth/infrastructure/crypto/argon2-password-hasher.js';
import { POSTGRES_POOL } from '../src/shared/database/postgres-pool.token.js';
import { configureJsonBody } from '../src/shared/http/configure-json-body.js';
import { createHttpTestModule } from './helpers/create-http-test-module.js';

describe('Login (e2e)', () => {
  let app: NestExpressApplication;

  const hasher = new Argon2PasswordHasher();
  const verify = vi.spyOn(hasher, 'verify');
  const query =
    vi.fn<(sql: string, values: unknown[]) => Promise<{ rows: unknown[] }>>();

  const password = '  Una frase con Café 🔐  ';
  const body = { email: 'Persona@Example.com', password };

  const row = {
    id: '6ba63463-9073-43d1-9b60-2fd868798cc0',
    email: 'persona@example.com',
    password_hash: '',
    created_at: new Date('2030-01-01T00:00:00.000Z'),
    summary_generation: 7,
  };

  const expiresAt = new Date('2030-01-01T01:00:00.000Z');

  const invalidCredentials = {
    code: 'INVALID_CREDENTIALS',
    message: 'No se pudo iniciar sesión.',
  };

  const internalError = {
    code: 'INTERNAL_ERROR',
    message: 'No se pudo completar la solicitud.',
  };

  async function createApp(rateLimited = false) {
    const builder = createHttpTestModule({ imports: [AppModule] })
      .overrideProvider(POSTGRES_POOL)
      .useValue({ query })
      .overrideProvider(PASSWORD_HASHER)
      .useValue(hasher)
      .overrideProvider(authConfig.KEY)
      .useValue({ sessionTtlSeconds: 3600 });

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
    row.password_hash = await hasher.hash(password);
    app = await createApp();
  });

  beforeEach(() => {
    verify.mockClear();
    query.mockReset();

    query.mockImplementation(async (sql, values) => {
      if (sql.includes('FROM public.users')) {
        return { rows: [row] };
      }

      if (sql.includes('INSERT INTO public.sessions')) {
        return { rows: [{ expires_at: expiresAt }] };
      }

      if (sql.includes('INSERT INTO public.users')) {
        return {
          rows: [{ id: row.id, email: values[0], created_at: row.created_at }],
        };
      }

      throw new Error('Unexpected SQL in login test');
    });
  });

  afterAll(async () => {
    await app.close();
    verify.mockRestore();
  });

  it('returns the contract response and persists only the token hash', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send(body)
      .expect(200)
      .expect('Cache-Control', 'no-store');

    expect(response.body).toEqual({
      user: {
        id: row.id,
        email: row.email,
        created_at: row.created_at.toISOString(),
      },
      access_token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      token_type: 'Bearer',
      expires_at: expiresAt.toISOString(),
      summary_generation: 7,
    });

    expect(verify).toHaveBeenCalledExactlyOnceWith(password, row.password_hash);

    const token = response.body.access_token as string;
    const tokenHash = createHash('sha256').update(token).digest('hex');

    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('WHERE email = $1'),
      [row.email],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO public.sessions'),
      [tokenHash, row.id, 3600],
    );
  });

  it.each(['x', '😀'.repeat(128)])(
    'accepts a stored password allowed by the login contract: %s',
    async (value) => {
      const storedHash = await hasher.hash(value);

      query.mockResolvedValueOnce({
        rows: [{ ...row, password_hash: storedHash }],
      });

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ ...body, password: value })
        .expect(200);

      expect(verify).toHaveBeenCalledExactlyOnceWith(value, storedHash);
    },
  );

  it.each([
    {},
    null,
    [],
    { ...body, email: 'invalid' },
    { ...body, email: ' Persona@Example.com' },
    { ...body, email: 'Persona@Example.com ' },
    { ...body, email: 'a'.repeat(243) + '@example.com' },
    { ...body, password: '' },
    { ...body, password: 123 },
    { ...body, password: 'x'.repeat(129) },
    { ...body, password: '😀'.repeat(129) },
    { ...body, password: '\ud800' },
    { ...body, extra: true },
  ])('rejects invalid input before credential lookup: %j', async (invalid) => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(invalid))
      .expect(400)
      .expect('Cache-Control', 'no-store')
      .expect({
        code: 'INVALID_REQUEST',
        message: 'Revisa los datos enviados.',
      });

    expect(query).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it.each(['missing account', 'wrong password'])(
    'uses the same response for %s',
    async (scenario) => {
      if (scenario === 'missing account') {
        query.mockResolvedValueOnce({ rows: [] });
      }

      const input =
        scenario === 'wrong password' ? { ...body, password: 'wrong' } : body;

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(input)
        .expect(401)
        .expect('Cache-Control', 'no-store')
        .expect(invalidCredentials);

      expect(verify).toHaveBeenCalledOnce();
      expect(query).toHaveBeenCalledOnce();
    },
  );

  it('rejects duplicate JSON keys', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send(
        '{"email":"persona@example.com","password":"first","password":"second"}',
      )
      .expect(400);

    expect(query).not.toHaveBeenCalled();
  });

  it('sanitizes a credential lookup failure', async () => {
    query.mockRejectedValueOnce(new Error('PRIVATE_LOOKUP_DETAILS'));

    await request(app.getHttpServer())
      .post('/auth/login')
      .send(body)
      .expect(500)
      .expect(internalError);

    expect(verify).not.toHaveBeenCalled();
  });

  it('sanitizes a password verification failure', async () => {
    verify.mockRejectedValueOnce(new Error('PRIVATE_HASH_DETAILS'));

    await request(app.getHttpServer())
      .post('/auth/login')
      .send(body)
      .expect(500)
      .expect(internalError);

    expect(query).toHaveBeenCalledOnce();
  });

  it('does not return a token when session persistence fails', async () => {
    query
      .mockResolvedValueOnce({ rows: [row] })
      .mockRejectedValueOnce(new Error('PRIVATE_SESSION_DETAILS'));

    await request(app.getHttpServer())
      .post('/auth/login')
      .send(body)
      .expect(500)
      .expect(internalError);
  });

  it('limits failed logins while keeping registration on its own counter', async () => {
    const limitedApp = await createApp(true);

    try {
      for (let index = 0; index < 5; index++) {
        await request(limitedApp.getHttpServer())
          .post('/auth/login')
          .send({ ...body, password: 'incorrecta' })
          .expect(401);
      }

      await request(limitedApp.getHttpServer())
        .post('/auth/login')
        .set('X-Forwarded-For', '198.51.100.99')
        .send(body)
        .expect(429)
        .expect('Retry-After', /^\d+$/)
        .expect('Cache-Control', 'no-store')
        .expect({ code: 'RATE_LIMITED', message: 'Inténtalo más tarde.' });

      expect(query).toHaveBeenCalledTimes(5);
      expect(verify).toHaveBeenCalledTimes(5);

      await request(limitedApp.getHttpServer())
        .post('/auth/register')
        .send({ email: 'otra@example.com', password })
        .expect(201);
    } finally {
      await limitedApp.close();
    }
  });
});
