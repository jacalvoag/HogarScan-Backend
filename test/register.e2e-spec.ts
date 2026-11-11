import { ThrottlerGuard } from '@nestjs/throttler';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PASSWORD_HASHER } from '../src/modules/auth/application/ports/password-hasher.port.js';
import { Argon2PasswordHasher } from '../src/modules/auth/infrastructure/crypto/argon2-password-hasher.js';
import { POSTGRES_POOL } from '../src/shared/database/postgres-pool.token.js';
import { configureJsonBody } from '../src/shared/http/configure-json-body.js';
import { createHttpTestModule } from './helpers/create-http-test-module.js';

describe('Registration (e2e)', () => {
  let app: NestExpressApplication;
  const hasher = new Argon2PasswordHasher();
  const hash = vi.spyOn(hasher, 'hash');
  const query =
    vi.fn<(sql: string, values: unknown[]) => Promise<{ rows: unknown[] }>>();

  const id = '6ba63463-9073-43d1-9b60-2fd868798cc0';
  const createdAt = new Date('2030-01-01T00:00:00.000Z');
  const body = {
    email: 'Persona@Example.com',
    password: '  Una frase con Café 🔐  ',
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
      .useValue(hasher);

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
    hash.mockClear();
    query.mockReset();
    query.mockImplementation(async (_sql, values) => ({
      rows: [{ id, email: values[0], created_at: createdAt }],
    }));
  });

  afterAll(async () => {
    await app.close();
    hash.mockRestore();
  });

  it('registers a normalized email with the exact password and no session', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(body)
      .expect(201)
      .expect('Cache-Control', 'no-store')
      .expect({
        id,
        email: 'persona@example.com',
        created_at: createdAt.toISOString(),
      });

    expect(hash).toHaveBeenCalledExactlyOnceWith(body.password);
    expect(query).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('INSERT INTO public.users'),
      ['persona@example.com', expect.stringMatching(/^\$argon2id\$/)],
    );

    const storedHash = query.mock.calls[0][1][1] as string;

    await expect(hasher.verify(body.password, storedHash)).resolves.toBe(true);
    await expect(hasher.verify(body.password.trim(), storedHash)).resolves.toBe(
      false,
    );
  });

  it.each([
    'x'.repeat(15),
    'x'.repeat(128),
    '😀'.repeat(15),
    '😀'.repeat(128),
    ' '.repeat(15),
  ])(
    'accepts password boundaries without transforming the value: %s',
    async (password) => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...body, password })
        .expect(201);

      expect(hash).toHaveBeenCalledExactlyOnceWith(password);
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
    { ...body, password: 'x'.repeat(14) },
    { ...body, password: 'x'.repeat(129) },
    { ...body, password: '😀'.repeat(14) },
    { ...body, password: '😀'.repeat(129) },
    { ...body, password: 'x'.repeat(14) + '\ud800' },
    { ...body, password: 123456789012345 },
    { ...body, extra: true },
  ])(
    'rejects invalid input before hashing or querying: %j',
    async (invalid) => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(invalid))
        .expect(400)
        .expect('Cache-Control', 'no-store')
        .expect({
          code: 'INVALID_REQUEST',
          message: 'Revisa los datos enviados.',
        });

      expect(hash).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('rejects duplicate JSON keys', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .set('Content-Type', 'application/json')
      .send(
        '{"email":"a@example.com","email":"b@example.com","password":"Una frase larga de prueba"}',
      )
      .expect(400);

    expect(hash).not.toHaveBeenCalled();
  });

  it('returns the agreed conflict response for a duplicate email', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app.getHttpServer())
      .post('/auth/register')
      .send(body)
      .expect(409)
      .expect('Cache-Control', 'no-store')
      .expect({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'El correo no está disponible.',
      });
  });

  it('sanitizes a database failure', async () => {
    query.mockRejectedValueOnce(new Error('PRIVATE_SQL_DETAILS'));

    await request(app.getHttpServer())
      .post('/auth/register')
      .send(body)
      .expect(500)
      .expect(internalError);
  });

  it('does not query PostgreSQL when hashing fails', async () => {
    hash.mockRejectedValueOnce(new Error('PRIVATE_HASH_DETAILS'));

    await request(app.getHttpServer())
      .post('/auth/register')
      .send(body)
      .expect(500)
      .expect(internalError);

    expect(query).not.toHaveBeenCalled();
  });

  it('limits registration attempts before hashing and includes Retry-After', async () => {
    const limitedApp = await createApp(true);

    try {
      for (let index = 0; index < 5; index++) {
        await request(limitedApp.getHttpServer())
          .post('/auth/register')
          .send({ ...body, email: `person${index}@example.com` })
          .expect(201);
      }

      await request(limitedApp.getHttpServer())
        .post('/auth/register')
        .set('X-Forwarded-For', '198.51.100.99')
        .send(body)
        .expect(429)
        .expect('Retry-After', /^\d+$/)
        .expect('Cache-Control', 'no-store')
        .expect({ code: 'RATE_LIMITED', message: 'Inténtalo más tarde.' });

      expect(hash).toHaveBeenCalledTimes(5);
      expect(query).toHaveBeenCalledTimes(5);
    } finally {
      await limitedApp.close();
    }
  });
});
