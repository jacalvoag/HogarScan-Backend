import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { EvaluateBasic } from '../src/modules/evaluations/application/evaluate-basic.js';
import { POSTGRES_POOL } from '../src/shared/database/postgres-pool.token.js';
import { configureJsonBody } from '../src/shared/http/configure-json-body.js';
import { createHttpTestModule } from './helpers/create-http-test-module.js';

describe('Evaluations module (e2e)', () => {
  let app: NestExpressApplication;
  let evaluate: EvaluateBasic;
  const token = 'A'.repeat(43);
  const query =
    vi.fn<(sql: string, values: unknown[]) => Promise<{ rows: unknown[] }>>();
  const row = {
    user_id: '6ba63463-9073-43d1-9b60-2fd868798cc0',
    expires_at: new Date(Date.now() + 86_400_000),
    revoked_at: null,
  };

  beforeAll(async () => {
    const moduleRef = await createHttpTestModule({
      imports: [AppModule],
    })
      .overrideProvider(POSTGRES_POOL)
      .useValue({ query })
      .compile();
    evaluate = moduleRef.get(EvaluateBasic);
    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
      rawBody: true,
    });
    configureJsonBody(app);
    await app.listen(0);
  });
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [row] });
  });
  afterAll(async () => {
    await app.close();
  });

  it('serves public rules without checking a session', async () => {
    const response = await request(app.getHttpServer())
      .get('/rules')
      .expect(200);
    expect(response.body).toMatchObject({
      ruleset_version: '0.1.0',
      max_probes_per_evaluation: 6,
      max_addresses_per_scan: 254,
    });
    expect(response.body.categories).toHaveLength(5);
    expect(response.body.allowed_ports).toEqual([22, 23, 80, 443, 445, 3389]);
    expect(query).not.toHaveBeenCalled();
  });

  it('evaluates authenticated requests with no-store and contract fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/evaluations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        probes: [
          {
            port: 80,
            outcome: 'ACCEPTED',
            protocol: 'HTTP',
            evidence_kind: 'HTTP_RESPONSE',
          },
        ],
      })
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(response.body).toMatchObject({
      ruleset_version: '0.1.0',
      sources: { nvd: 'NOT_QUERIED', kev: 'NOT_QUERIED', checked_at: null },
      possible_cve_matches: [],
    });
    expect(
      response.body.findings.map(
        (finding: { rule_id: string }) => finding.rule_id,
      ),
    ).toEqual(['TCP_ACCEPTED', 'PROTOCOL_IDENTIFIED']);
    expect(response.body.evaluated_at).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: 'missing', rows: [] },
    { label: 'expired', rows: [{ ...row, expires_at: new Date(0) }] },
    { label: 'revoked', rows: [{ ...row, revoked_at: new Date() }] },
  ])('rejects a $label session before evaluation', async ({ rows }) => {
    query.mockResolvedValueOnce({ rows });
    const spy = vi.spyOn(evaluate, 'execute');
    await request(app.getHttpServer())
      .post('/evaluations')
      .set('Authorization', `Bearer ${token}`)
      .send({ probes: [{ port: 22, outcome: 'ERROR' }] })
      .expect(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('rejects missing authentication before evaluation', async () => {
    const spy = vi.spyOn(evaluate, 'execute');
    await request(app.getHttpServer())
      .post('/evaluations')
      .send({ probes: [{ port: 22, outcome: 'ERROR' }] })
      .expect(401);
    expect(spy).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('rejects malformed bearer credentials before evaluation', async () => {
    const spy = vi.spyOn(evaluate, 'execute');
    await request(app.getHttpServer())
      .post('/evaluations')
      .set('Authorization', 'Bearer invalid')
      .send({ probes: [{ port: 22, outcome: 'ERROR' }] })
      .expect(401);
    expect(spy).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('rejects duplicate JSON keys at the application boundary', async () => {
    await request(app.getHttpServer())
      .post('/evaluations')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send('{"probes":[{"port":22,"port":80,"outcome":"ERROR"}]}')
      .expect(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects invalid UTF-8 at the application boundary', async () => {
    const pending = request(app.getHttpServer())
      .post('/evaluations')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json');
    pending.write(
      Buffer.concat([
        Buffer.from('{"value":"'),
        Buffer.from([0xc3]),
        Buffer.from('"}'),
      ]),
    );
    await pending.expect(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects oversized JSON before evaluation', async () => {
    await request(app.getHttpServer())
      .post('/evaluations')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ value: 'a'.repeat(16384) }))
      .expect(413);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects unsupported content types before evaluation', async () => {
    await request(app.getHttpServer())
      .post('/evaluations')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'text/plain')
      .send('invalid')
      .expect(415);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects invalid input before evaluation', async () => {
    const spy = vi.spyOn(evaluate, 'execute');
    await request(app.getHttpServer())
      .post('/evaluations')
      .set('Authorization', `Bearer ${token}`)
      .send({ probes: [{ port: 22, outcome: 'ERROR' }], user_id: 'other' })
      .expect(400);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it.each([
    {
      probes: [
        { port: 22, outcome: 'ERROR' },
        { port: 22, outcome: 'ACCEPTED' },
      ],
    },
    {
      probes: [
        {
          port: 22,
          outcome: 'ACCEPTED',
          protocol: 'SSH',
          evidence_kind: 'HTTP_RESPONSE',
        },
      ],
    },
    { probes: [{ port: 22, outcome: 'ERROR', banner: 'private' }] },
    {
      probes: [{ port: 22, outcome: 'ERROR' }],
      identification: {
        vendor: 'x',
        product: 'x',
        version: '1',
        source: 'USER_DEVICE_LABEL',
        extra: true,
      },
    },
  ])(
    'rejects invalid contract relations and nested fields %#',
    async (body) => {
      const spy = vi.spyOn(evaluate, 'execute');
      await request(app.getHttpServer())
        .post('/evaluations')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(400);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    },
  );

  it('returns the exact response shape without writing an evaluation', async () => {
    const response = await request(app.getHttpServer())
      .post('/evaluations')
      .set('Authorization', `Bearer ${token}`)
      .send({ probes: [{ port: 443, outcome: 'TIMEOUT' }] })
      .expect(200);
    expect(Object.keys(response.body).sort()).toEqual([
      'evaluated_at',
      'findings',
      'possible_cve_matches',
      'ruleset_version',
      'sources',
    ]);
    expect(Object.keys(response.body.findings[0]).sort()).toEqual([
      'action',
      'category',
      'confidence',
      'cve',
      'evidence',
      'explanation',
      'limitation',
      'priority',
      'rule_id',
      'title',
    ]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toMatch(/SELECT/i);
  });
});
