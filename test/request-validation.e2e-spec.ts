import { Body, Controller, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { configureJsonBody } from '../src/shared/http/configure-json-body.js';

const bodySchema = z.strictObject({
  label: z.string().min(1),
  count: z.number().int().positive(),
  options: z.strictObject({ enabled: z.boolean() }),
});
type TestBody = z.infer<typeof bodySchema>;

const permissiveSchema = z.object({ count: z.coerce.number() });
type PermissiveBody = z.infer<typeof permissiveSchema>;

// Controlador exclusivo de pruebas; no se registra en la aplicación real.
@Controller('__test-validation')
class ValidationFixturesController {
  @Post()
  create(@Body({ schema: bodySchema }) body: TestBody) {
    return body;
  }

  @Post('permissive')
  permissive(@Body({ schema: permissiveSchema }) body: PermissiveBody) {
    return body;
  }
}

describe('Request schema validation (e2e)', () => {
  let app: NestExpressApplication;
  const validBody: TestBody = {
    label: 'HogarScan',
    count: 1,
    options: { enabled: true },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ValidationFixturesController],
    }).compile();

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

  it.each([validBody, { ...validBody, label: ' HogarScan ' }])(
    'preserves a valid body: %j',
    async (body) => {
      await request(app.getHttpServer())
        .post('/__test-validation')
        .send(body)
        .expect(201)
        .expect(body);
    },
  );

  it.each([
    JSON.stringify({ ...validBody, extra: true }),
    JSON.stringify({ ...validBody, options: { enabled: true, extra: true } }),
    JSON.stringify({ ...validBody, count: '1' }),
    JSON.stringify({ ...validBody, label: 123 }),
    JSON.stringify({ ...validBody, options: { enabled: 'true' } }),
    JSON.stringify({ label: 'HogarScan', count: 1 }),
    'null',
    '[]',
    '{"label":"HogarScan","count":1,"options":{"enabled":true},"__proto__":{}}',
    '{"label":"HogarScan","count":1,"options":{"enabled":true},"constructor":false}',
    '{"label":"HogarScan","count":1,"options":{"enabled":true,"prototype":{}}}',
  ])('rejects an invalid body: %s', async (body) => {
    await request(app.getHttpServer())
      .post('/__test-validation')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(400)
      .expect('Cache-Control', 'no-store')
      .expect({
        code: 'INVALID_REQUEST',
        message: 'Revisa los datos enviados.',
      });
  });

  it.each([{ count: '1' }, { count: 1, extra: true }])(
    'rejects coercion or field removal by a permissive schema: %j',
    async (body) => {
      await request(app.getHttpServer())
        .post('/__test-validation/permissive')
        .send(body)
        .expect(400)
        .expect({
          code: 'INVALID_REQUEST',
          message: 'Revisa los datos enviados.',
        });
    },
  );
});