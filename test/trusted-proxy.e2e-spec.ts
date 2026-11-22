import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { configureTrustedProxy } from '../src/shared/http/configure-trusted-proxy.js';

// Controlador exclusivo de pruebas; no se registra en la aplicación real.
@Controller('__test-proxy')
class ProxyFixtureController {
  @Get()
  inspect(@Req() req: Request) {
    return {
      ip: req.ip,
      peer: req.socket.remoteAddress,
      protocol: req.protocol,
    };
  }

  @Get('limited')
  @UseGuards(ThrottlerGuard)
  limited() {
    return { status: 'ok' };
  }
}

describe('Trusted local proxy (e2e)', () => {
  const apps: NestExpressApplication[] = [];

  async function createApp(enabled: boolean, peer?: string) {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ ttl: 60_000, limit: 2 }],
        }),
      ],
      controllers: [ProxyFixtureController],
      providers: [ThrottlerGuard],
    }).compile();

    const app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });

    apps.push(app);
    configureTrustedProxy(app, enabled);

    if (peer !== undefined) {
      app.use((req: Request, _res: Response, next: NextFunction) => {
        // Simula el origen de la conexión, no un encabezado del cliente.
        Object.defineProperty(req.socket, 'remoteAddress', { value: peer });
        next();
      });
    }

    await app.init();
    return app;
  }

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('ignores forwarded headers when proxy trust is disabled', async () => {
    const app = await createApp(false);

    const response = await request(app.getHttpServer())
      .get('/__test-proxy')
      .set('X-Forwarded-For', '198.51.100.10')
      .set('X-Forwarded-Proto', 'https')
      .expect(200);

    expect(response.body.ip).toBe(response.body.peer);
    expect(response.body.protocol).toBe('http');
  });

  it('uses the client address and protocol forwarded by a local proxy', async () => {
    const app = await createApp(true);

    await request(app.getHttpServer())
      .get('/__test-proxy')
      .set('X-Forwarded-For', '198.51.100.10')
      .set('X-Forwarded-Proto', 'https')
      .expect(200)
      .expect(({ body }) => {
        expect(body.ip).toBe('198.51.100.10');
        expect(body.protocol).toBe('https');
      });
  });

  it('ignores forwarded headers from a non-loopback peer', async () => {
    const app = await createApp(true, '198.51.100.20');

    await request(app.getHttpServer())
      .get('/__test-proxy')
      .set('X-Forwarded-For', '203.0.113.99')
      .set('X-Forwarded-Proto', 'https')
      .expect(200)
      .expect({
        ip: '198.51.100.20',
        peer: '198.51.100.20',
        protocol: 'http',
      });
  });

  it('keeps separate rate-limit counters for clients behind the local proxy', async () => {
    const app = await createApp(true);

    for (let index = 0; index < 2; index++) {
      await request(app.getHttpServer())
        .get('/__test-proxy/limited')
        .set('X-Forwarded-For', '198.51.100.10')
        .expect(200);
    }

    await request(app.getHttpServer())
      .get('/__test-proxy/limited')
      .set('X-Forwarded-For', '198.51.100.10')
      .expect(429);

    await request(app.getHttpServer())
      .get('/__test-proxy/limited')
      .set('X-Forwarded-For', '198.51.100.11')
      .expect(200);
  });

  it('does not bypass the limit by changing the untrusted end of a chain', async () => {
    const app = await createApp(true);

    for (const forged of ['198.51.100.1', '198.51.100.2']) {
      await request(app.getHttpServer())
        .get('/__test-proxy/limited')
        .set('X-Forwarded-For', `${forged}, 203.0.113.10`)
        .expect(200);
    }

    await request(app.getHttpServer())
      .get('/__test-proxy/limited')
      .set('X-Forwarded-For', '198.51.100.3, 203.0.113.10')
      .expect(429);
  });
});
