import { Controller, Get, HttpException, Param, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureJsonBody } from '../src/shared/http/configure-json-body.js';

const privateDetail = 'PRIVATE_DETAIL_DO_NOT_EXPOSE';

// Estas rutas existen únicamente en el módulo de pruebas.
@Controller('__test-errors')
class ErrorFixturesController {
  @Get('http/:status')
  httpError(@Param('status') status: string): never {
    throw new HttpException(
      { message: privateDetail, secret: privateDetail },
      Number(status),
    );
  }

  @Get('unexpected')
  unexpectedError(): never {
    throw new Error(privateDetail);
  }

  @Post('json')
  validJson() {
    return { ok: true };
  }
}

describe('HTTP error responses (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ErrorFixturesController],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ 
        logger: false 
    });
    configureJsonBody(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    [400, 'INVALID_REQUEST', 'Revisa los datos enviados.'],
    [401, 'UNAUTHENTICATED', 'Inicia sesión de nuevo.'],
    [413, 'PAYLOAD_TOO_LARGE', 'La solicitud es demasiado grande.'],
    [415, 'UNSUPPORTED_MEDIA_TYPE', 'Formato de solicitud no admitido.'],
    [429, 'RATE_LIMITED', 'Inténtalo más tarde.'],
    [503, 'SERVICE_UNAVAILABLE', 'Servicio temporalmente no disponible.'],
  ] as const)(
    'normalizes HTTP %i without exposing its payload',
    async (status, code, message) => {
      const response = await request(app.getHttpServer())
        .get(`/__test-errors/http/${status}`)
        .expect(status)
        .expect('Cache-Control', 'no-store');

      expect(response.body).toEqual({ code, message });
      expect(response.text).not.toContain(privateDetail);
    },
  );

  it('includes the Bearer challenge for an unauthenticated request', async () => {
    await request(app.getHttpServer())
      .get('/__test-errors/http/401')
      .expect(401)
      .expect('WWW-Authenticate', 'Bearer');
  });

  it('sanitizes unexpected errors and returns HTTP 500', async () => {
    const response = await request(app.getHttpServer())
      .get('/__test-errors/unexpected')
      .expect(500)
      .expect('Cache-Control', 'no-store');

    expect(response.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'No se pudo completar la solicitud.',
    });
    expect(response.text).not.toContain(privateDetail);
  });

  it('normalizes a route that does not exist', async () => {
    await request(app.getHttpServer())
      .get('/missing-route')
      .expect(404)
      .expect({
        code: 'INVALID_REQUEST',
        message: 'La ruta solicitada no existe.',
      });
  });

  it('normalizes malformed JSON before the controller executes', async () => {
    await request(app.getHttpServer())
      .post('/__test-errors/json')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400)
      .expect({
        code: 'INVALID_REQUEST',
        message: 'Revisa los datos enviados.',
      });
  });

  describe.each([
    ['ASCII', 'a'.repeat(16_372)],
    ['UTF-8', 'á'.repeat(8_186)],
  ])('JSON body size (%s)', (_encoding, value) => {
    const body = JSON.stringify({ value });

    it('accepts exactly 16,384 bytes', async () => {
      expect(Buffer.byteLength(body, 'utf8')).toBe(16_384);

      await request(app.getHttpServer())
        .post('/__test-errors/json')
        .set('Content-Type', 'application/json; charset=utf-8')
        .send(body)
        .expect(201)
        .expect({ ok: true });
    });

    it('rejects 16,385 bytes with the common error response', async () => {
      const oversizedBody = `${body} `;
      expect(Buffer.byteLength(oversizedBody, 'utf8')).toBe(16_385);

      await request(app.getHttpServer())
        .post('/__test-errors/json')
        .set('Content-Type', 'application/json; charset=utf-8')
        .send(oversizedBody)
        .expect(413)
        .expect('Cache-Control', 'no-store')
        .expect({
          code: 'PAYLOAD_TOO_LARGE',
          message: 'La solicitud es demasiado grande.',
        });
    });
  });
});
