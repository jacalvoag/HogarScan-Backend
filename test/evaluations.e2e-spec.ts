import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { EvaluateBasic } from '../src/modules/evaluations/application/evaluate-basic.js';
import { EvaluationsModule } from '../src/modules/evaluations/evaluations.module.js';
import { POSTGRES_POOL } from '../src/shared/database/postgres-pool.token.js';
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
      imports: [AppModule, EvaluationsModule],
    })
      .overrideProvider(POSTGRES_POOL)
      .useValue({ query })
      .compile();
    evaluate = moduleRef.get(EvaluateBasic);
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
});
