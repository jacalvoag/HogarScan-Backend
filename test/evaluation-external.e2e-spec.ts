import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AppModule } from '../src/app.module.js';
import {
  externalSourcesConfig,
  validateExternalSourcesEnvironment,
} from '../src/config/external-sources.config.js';
import { POSTGRES_POOL } from '../src/shared/database/postgres-pool.token.js';
import { configureJsonBody } from '../src/shared/http/configure-json-body.js';
import { createHttpTestModule } from './helpers/create-http-test-module.js';
import { ExternalSourceClients } from '../src/modules/evaluations/infrastructure/http/external-source-clients.js';

describe('Evaluación externa integrada sin proveedores reales', () => {
  let app: NestExpressApplication;
  let source: ExternalSourceClients;
  const token = 'A'.repeat(43);
  const secondToken = 'B'.repeat(43);
  const fetcher = vi.fn<typeof fetch>();
  const cve = 'CVE-2026-987654';
  const cpeName = 'cpe:2.3:h:example:device:1:*:*:*:*:*:*:*';
  const body = {
    probes: [{ port: 22, outcome: 'ACCEPTED' }],
    identification: {
      vendor: 'Example',
      product: 'Device',
      version: '1',
      source: 'USER_DEVICE_LABEL',
    },
  };
  const page = {
    resultsPerPage: 1,
    startIndex: 0,
    totalResults: 1,
    format: 'NVD_CPE',
    version: '2.0',
    timestamp: '2026-11-14T00:00:00.000',
    products: [
      {
        cpe: {
          cpeName,
          cpeNameId: '00000000-0000-4000-8000-000000000001',
          deprecated: false,
          created: '2026-11-14T00:00:00.000',
          lastModified: '2026-11-14T00:00:00.000',
        },
      },
    ],
  };
  const cvePage = {
    resultsPerPage: 1,
    startIndex: 0,
    totalResults: 1,
    version: '2.0',
    format: 'NVD_CVE',
    timestamp: page.timestamp,
    vulnerabilities: [
      {
        cve: {
          id: cve,
          vulnStatus: 'Analyzed',
          published: page.timestamp,
          lastModified: page.timestamp,
          descriptions: [{ lang: 'en', value: 'Synthetic CVE' }],
          references: [],
          configurations: [
            {
              nodes: [
                {
                  operator: 'OR',
                  cpeMatch: [
                    {
                      vulnerable: true,
                      criteria: cpeName,
                      matchCriteriaId: '00000000-0000-4000-8000-000000000002',
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  };
  const kevCatalog = {
    catalogVersion: 'test',
    dateReleased: '2026-11-14T00:00:00Z',
    count: 1,
    vulnerabilities: [
      {
        cveID: cve,
        vendorProject: 'Example',
        product: 'Device',
        vulnerabilityName: 'Synthetic CVE',
        dateAdded: '2026-11-01',
        shortDescription: 'Synthetic',
        requiredAction: 'Review',
        dueDate: '2026-12-01',
      },
    ],
  };
  const jsonResponse = (payload: unknown) =>
    new Response(JSON.stringify(payload), {
      headers: { 'content-type': 'application/json' },
    });

  beforeAll(async () => {
    fetcher.mockImplementation(async (url) => {
      if (!(url instanceof URL)) throw new Error('Expected provider URL');
      const payloads: Record<string, unknown> = {
        '/rest/json/cpes/2.0': page,
        '/rest/json/cves/2.0': cvePage,
        '/sites/default/files/feeds/known_exploited_vulnerabilities.json':
          kevCatalog,
      };
      const payload = payloads[url.pathname];
      if (payload === undefined) throw new Error('Unexpected provider');
      return jsonResponse(payload);
    });
    vi.stubGlobal('fetch', fetcher);
    const config = validateExternalSourcesEnvironment({
      EXTERNAL_SOURCES_ENABLED: 'true',
    });
    const testAccounts = new Map(
      [
        [token, '00000000-0000-4000-8000-000000000001'],
        [secondToken, '00000000-0000-4000-8000-000000000002'],
      ].map(([value, userId]) => [
        createHash('sha256').update(value).digest('hex'),
        userId,
      ]),
    );
    const query = vi.fn(async (_sql: string, [tokenHash]: [string]) => {
      const userId = testAccounts.get(tokenHash);
      return {
        rows:
          userId === undefined
            ? []
            : [
                {
                  user_id: userId,
                  expires_at: new Date(Date.now() + 86400000),
                  revoked_at: null,
                },
              ],
      };
    });
    const moduleRef = await createHttpTestModule({ imports: [AppModule] })
      .overrideProvider(POSTGRES_POOL)
      .useValue({ query })
      .overrideProvider(externalSourcesConfig.KEY)
      .useValue({ ...config, nvdMaxPages: 2, nvdMinIntervalMs: 1 })
      .compile();
    source = moduleRef.get(ExternalSourceClients);
    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
      rawBody: true,
    });
    configureJsonBody(app);
    await app.listen(0);
  });
  afterAll(async () => {
    await app.close();
    vi.unstubAllGlobals();
  });

  it('comparte consultas y procedencia entre dos cuentas con evaluaciones simultáneas', async () => {
    let releaseFirstPage: () => void = () => undefined;
    const bothSearching = new Promise<void>((resolve) => {
      releaseFirstPage = resolve;
    });
    const searchCpe = source.searchCpe.bind(source);
    let searches = 0;
    const spy = vi.spyOn(source, 'searchCpe').mockImplementation((...args) => {
      const result = searchCpe(...args);
      if (++searches === 2) releaseFirstPage();
      return result;
    });
    fetcher.mockImplementationOnce(async () => {
      await bothSearching;
      return jsonResponse(page);
    });
    const evaluate = (session: string) =>
      request(app.getHttpServer())
        .post('/evaluations')
        .set('Authorization', `Bearer ${session}`)
        .send(body)
        .expect(200)
        .expect('Cache-Control', 'no-store');
    const [first, second] = await Promise.all([
      evaluate(token),
      evaluate(secondToken),
    ]).finally(() => {
      releaseFirstPage();
      spy.mockRestore();
    });
    expect(first.body.sources).toMatchObject({
      nvd: 'AVAILABLE',
      kev: 'AVAILABLE',
    });
    expect(first.body.sources.checked_at).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(first.body.possible_cve_matches).toMatchObject([
      {
        cve,
        vendor: 'Example',
        product: 'Device',
        version: '1',
        identification_source: 'USER_DEVICE_LABEL',
        nvd_url: `https://nvd.nist.gov/vuln/detail/${cve}`,
        in_kev: true,
      },
    ]);
    expect(first.body.possible_cve_matches[0].affected_condition).toContain(
      cpeName,
    );
    expect(first.body.findings).toContainEqual(
      expect.objectContaining({
        cve,
        category: 'POSSIBLE_CVE_MATCH',
        confidence: 'POSSIBLE',
        priority: 'UNDETERMINED',
        rule_id: 'NVD_POSSIBLE_MATCH',
      }),
    );
    expect(second.body.sources).toEqual(first.body.sources);
    expect(second.body.possible_cve_matches).toEqual(
      first.body.possible_cve_matches,
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
    const url = fetcher.mock.calls[0][0];
    expect(url).toBeInstanceOf(URL);
    expect((url as URL).hostname).toBe('services.nvd.nist.gov');
    expect((url as URL).searchParams.get('cpeMatchString')).toBe(
      'cpe:2.3:*:Example:Device:1',
    );
    expect((fetcher.mock.calls[1][0] as URL).searchParams.get('cpeName')).toBe(
      cpeName,
    );
    const cached = await evaluate(secondToken);
    expect(cached.body.sources).toEqual(first.body.sources);
    expect(cached.body.possible_cve_matches).toEqual(
      first.body.possible_cve_matches,
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
    const rules = await request(app.getHttpServer()).get('/rules').expect(200);
    expect(first.body.ruleset_version).toBe('0.3.0');
    expect(rules.body.ruleset_version).toBe(first.body.ruleset_version);
  });

  it.each([
    { version: '2', totalResults: 2, nvd: 'AVAILABLE' },
    { version: '3', totalResults: 3, nvd: 'UNAVAILABLE' },
  ])(
    'no busca CVE si el diccionario da NVD $nvd sin resolución única',
    async ({ version, totalResults, nvd }) => {
      const priorCalls = fetcher.mock.calls.length;
      const candidate = page.products[0].cpe;
      const firstName = candidate.cpeName.replace(':1:', `:${version}:`);
      fetcher
        .mockResolvedValueOnce(
          jsonResponse({
            ...page,
            totalResults,
            products: [{ cpe: { ...candidate, cpeName: firstName } }],
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            ...page,
            totalResults,
            startIndex: 1,
            products: [
              {
                cpe: {
                  ...candidate,
                  cpeNameId: '00000000-0000-4000-8000-000000000003',
                  cpeName: firstName.replace(':h:', ':a:'),
                },
              },
            ],
          }),
        );
      const response = await request(app.getHttpServer())
        .post('/evaluations')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...body, identification: { ...body.identification, version } })
        .expect(200);
      expect(response.body.sources).toMatchObject({ nvd, kev: 'NOT_QUERIED' });
      expect(response.body.possible_cve_matches).toEqual([]);
      expect(response.body.findings).toEqual([
        expect.objectContaining({ rule_id: 'TCP_ACCEPTED' }),
      ]);
      const urls = fetcher.mock.calls
        .slice(priorCalls)
        .map(([url]) => url as URL);
      expect(urls.map((url) => url.pathname)).toEqual([
        '/rest/json/cpes/2.0',
        '/rest/json/cpes/2.0',
      ]);
      expect(urls.map((url) => url.searchParams.get('startIndex'))).toEqual([
        '0',
        '1',
      ]);
    },
  );

  it('cancela la consulta si el cliente cierra la conexión', async () => {
    let notifyStarted: (signal: AbortSignal) => void = () => undefined;
    const started = new Promise<AbortSignal>((resolve) => {
      notifyStarted = resolve;
    });
    const spy = vi
      .spyOn(source, 'searchCpe')
      .mockImplementation((_identification, signal) => {
        notifyStarted(signal);
        return new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          }),
        );
      });
    try {
      const payload = JSON.stringify(body);
      const port = (app.getHttpServer().address() as AddressInfo).port;
      const client = httpRequest({
        hostname: '127.0.0.1',
        port,
        method: 'POST',
        path: '/evaluations',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        },
      });
      client.on('error', () => undefined);
      client.end(payload);
      const signal = await started;
      const aborted = new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
      client.destroy();
      await aborted;
      expect(signal.aborted).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
