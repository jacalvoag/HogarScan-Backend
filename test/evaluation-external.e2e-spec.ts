import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
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
      return new Response(JSON.stringify(payload), {
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetcher);
    const config = validateExternalSourcesEnvironment({
      EXTERNAL_SOURCES_ENABLED: 'true',
    });
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          user_id: '6ba63463-9073-43d1-9b60-2fd868798cc0',
          expires_at: new Date(Date.now() + 86400000),
          revoked_at: null,
        },
      ],
    });
    const moduleRef = await createHttpTestModule({ imports: [AppModule] })
      .overrideProvider(POSTGRES_POOL)
      .useValue({ query })
      .overrideProvider(externalSourcesConfig.KEY)
      .useValue({ ...config, nvdMinIntervalMs: 1 })
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

  it('publica la coincidencia sustentada y conserva la procedencia al usar caché', async () => {
    const first = await request(app.getHttpServer())
      .post('/evaluations')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(200)
      .expect('Cache-Control', 'no-store');
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
    const second = await request(app.getHttpServer())
      .post('/evaluations')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(200);
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
  });

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
