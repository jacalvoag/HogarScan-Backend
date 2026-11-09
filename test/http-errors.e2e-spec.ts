import { Controller, Get, HttpException, Param, Post } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureJsonBody } from '../src/shared/http/configure-json-body.js';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import { createHttpTestModule } from './helpers/create-http-test-module.js';

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
    const moduleRef = await createHttpTestModule({
      imports: [AppModule],
      controllers: [ErrorFixturesController],
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

  it.each([
    ['gzip', gzipSync],
    ['deflate', deflateSync],
    ['br', brotliCompressSync],
  ] as const)(
    'rejects a JSON body compressed with %s',
    async (encoding, compress) => {
      const body = compress(Buffer.from('{"value":"test"}', 'utf8'));

      const compressedRequest = request(app.getHttpServer())
        .post('/__test-errors/json')
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', encoding);

      compressedRequest.write(body);

      await compressedRequest
        .expect(415)
        .expect('Cache-Control', 'no-store')
        .expect({
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Formato de solicitud no admitido.',
        });
    },
  );

  it('accepts an uncompressed JSON body with identity encoding', async () => {
    await request(app.getHttpServer())
      .post('/__test-errors/json')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'identity')
      .send('{"value":"test"}')
      .expect(201)
      .expect({ ok: true });
  });

  it.each([
    'application/json',
    'application/json; charset=utf-8',
    'Application/JSON; Charset="UTF-8"',
  ])('accepts a JSON body with Content-Type %s', async (contentType) => {
    await request(app.getHttpServer())
      .post('/__test-errors/json')
      .set('Content-Type', contentType)
      .send('{"value":"á"}')
      .expect(201)
      .expect({ ok: true });
  });

  it.each([
    'text/plain',
    'application/x-www-form-urlencoded',
    'multipart/form-data; boundary=test',
    'application/vnd.test+json',
    'application/json; charset=utf-16le',
    'application/json; charset=iso-8859-1',
    'invalid-content-type',
  ])('rejects a body with Content-Type %s', async (contentType) => {
    await request(app.getHttpServer())
      .post('/__test-errors/json')
      .set('Content-Type', contentType)
      .send('{"value":"test"}')
      .expect(415)
      .expect('Cache-Control', 'no-store')
      .expect({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Formato de solicitud no admitido.',
      });
  });

  it('rejects a body without Content-Type', async () => {
    const missingTypeRequest = request(app.getHttpServer()).post(
      '/__test-errors/json',
    );

    missingTypeRequest.write('{"value":"test"}');

    await missingTypeRequest
      .expect(415)
      .expect('Cache-Control', 'no-store')
      .expect({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Formato de solicitud no admitido.',
      });
  });

  it.each([
    ['isolated continuation byte', [0x80]],
    ['truncated sequence', [0xc3]],
    ['overlong sequence', [0xc0, 0xaf]],
    ['surrogate encoding', [0xed, 0xa0, 0x80]],
  ] as const)('rejects invalid UTF-8: %s', async (_description, bytes) => {
    const body = Buffer.concat([
      Buffer.from('{"value":"'),
      Buffer.from(bytes),
      Buffer.from('"}'),
    ]);
    const invalidRequest = request(app.getHttpServer())
      .post('/__test-errors/json')
      .set('Content-Type', 'application/json; charset=utf-8');

    invalidRequest.write(body);

    await invalidRequest
      .expect(400)
      .expect('Cache-Control', 'no-store')
      .expect({
        code: 'INVALID_REQUEST',
        message: 'Revisa los datos enviados.',
      });
  });

  it('accepts valid UTF-8 including an explicit replacement character', async () => {
    await request(app.getHttpServer())
      .post('/__test-errors/json')
      .set('Content-Type', 'application/json; charset=utf-8')
      .send(JSON.stringify({ value: 'á 🏠 \uFFFD' }))
      .expect(201)
      .expect({ ok: true });
  });

  it.each([
    '{"port":80,"port":443}',
    '{"port":80,"port":80}',
    '{"probe":{"port":80,"port":443}}',
    '{"probes":[{"port":80,"port":443}]}',
    String.raw`{"port":80,"\u0070ort":443}`,
    String.raw`{"a\"b":1,"a\u0022b":2}`,
    '{"__proto__":1,"__proto__":2}',
    '\uFEFF{"port":80,"port":443}',
  ])('rejects duplicate JSON keys: %s', async (body) => {
    await request(app.getHttpServer())
      .post('/__test-errors/json')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(400)
      .expect('Cache-Control', 'no-store')
      .expect({
        code: 'INVALID_REQUEST',
        message: 'Revisa los datos enviados.',
      });
  });

  it.each([
    '{"left":{"port":80},"right":{"port":443}}',
    '{"probes":[{"port":80},{"port":443}]}',
    '{"port":80,"Port":443}',
    '{"__proto__":1,"constructor":2,"toString":3}',
    JSON.stringify({ text: '"port":80,"port":443' }),
    '\uFEFF{"port":80}',
  ])('accepts JSON without duplicate keys: %s', async (body) => {
    await request(app.getHttpServer())
      .post('/__test-errors/json')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(201)
      .expect({ ok: true });
  });
});
