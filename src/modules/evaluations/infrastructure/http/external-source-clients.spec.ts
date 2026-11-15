import { ExternalSourceError } from '../../application/ports/external-source-result.js';
import type { SourcedValue } from '../../application/ports/external-source-result.js';
import { ExternalSourceClients } from './external-source-clients.js';
import type { ExternalRequest } from './external-transport.js';

describe('External source clients', () => {
  const signal = new AbortController().signal;
  const older = new Date('2026-11-13T00:00:00Z');
  const newer = new Date('2026-11-14T00:00:00Z');
  const identification = {
    vendor: 'Example',
    product: 'Router',
    version: '1.0',
    source: 'USER_DEVICE_LABEL',
  } as const;
  const nvdBase = {
    resultsPerPage: 1,
    startIndex: 0,
    totalResults: 2,
    version: '2.0',
    timestamp: '2026-11-14T00:00:00.000',
  };
  const cpe = {
    cpeName: 'cpe:2.3:h:example:router:1.0:*:*:*:*:*:*:*',
    cpeNameId: '00000000-0000-4000-8000-000000000001',
    deprecated: false,
    created: '2026-11-14T00:00:00.000',
    lastModified: '2026-11-14T00:00:00.000',
  };
  const cve = {
    id: 'CVE-2026-1234',
    published: '2026-11-14T00:00:00.000',
    lastModified: '2026-11-14T00:00:00.000',
    descriptions: [{ lang: 'en', value: 'Synthetic' }],
    references: [],
  };

  function fakeGateway(responses: readonly SourcedValue<unknown>[]) {
    const requests: ExternalRequest[] = [];
    return {
      requests,
      gateway: {
        async get<T>(
          request: ExternalRequest,
          parser: (input: unknown) => T,
        ): Promise<SourcedValue<T>> {
          requests.push(request);
          const result = responses[requests.length - 1];
          if (result === undefined) throw new Error('Unexpected test request');
          return { value: parser(result.value), obtainedAt: result.obtainedAt };
        },
      },
    };
  }

  it('collects all CPE pages and retains the oldest acquisition date', async () => {
    const fake = fakeGateway([
      {
        value: { ...nvdBase, format: 'NVD_CPE', products: [{ cpe }] },
        obtainedAt: newer,
      },
      {
        value: {
          ...nvdBase,
          startIndex: 1,
          format: 'NVD_CPE',
          products: [
            {
              cpe: {
                ...cpe,
                cpeNameId: '00000000-0000-4000-8000-000000000002',
              },
            },
          ],
        },
        obtainedAt: older,
      },
    ]);
    const client = new ExternalSourceClients(fake.gateway, {
      nvdPageSize: 1,
      nvdMaxPages: 2,
    });
    const result = await client.searchCpe(
      identification,
      signal,
      Number.MAX_SAFE_INTEGER,
    );
    expect(result.value).toHaveLength(2);
    expect(result.obtainedAt).toEqual(older);
    expect(fake.requests).toEqual([
      {
        kind: 'NVD_CPE',
        keyword: 'Example Router',
        startIndex: 0,
        pageSize: 1,
      },
      {
        kind: 'NVD_CPE',
        keyword: 'Example Router',
        startIndex: 1,
        pageSize: 1,
      },
    ]);
  });

  it('does not treat a page limit as a complete search', async () => {
    const fake = fakeGateway([
      {
        value: { ...nvdBase, format: 'NVD_CPE', products: [{ cpe }] },
        obtainedAt: older,
      },
    ]);
    const client = new ExternalSourceClients(fake.gateway, {
      nvdPageSize: 1,
      nvdMaxPages: 1,
    });
    await expect(
      client.searchCpe(identification, signal, Number.MAX_SAFE_INTEGER),
    ).rejects.toBeInstanceOf(ExternalSourceError);
  });

  it('collects CVEs without converting candidates into findings', async () => {
    const fake = fakeGateway([
      {
        value: {
          ...nvdBase,
          totalResults: 1,
          format: 'NVD_CVE',
          vulnerabilities: [{ cve }],
        },
        obtainedAt: older,
      },
    ]);
    const client = new ExternalSourceClients(fake.gateway, {
      nvdPageSize: 1,
      nvdMaxPages: 2,
    });
    const result = await client.searchCve(
      cpe.cpeName,
      signal,
      Number.MAX_SAFE_INTEGER,
    );
    expect(result.value).toMatchObject([
      { cve: 'CVE-2026-1234', configurations: null },
    ]);
    expect(fake.requests[0]).toMatchObject({
      kind: 'NVD_CVE',
      cpeName: cpe.cpeName,
    });
  });

  it('rejects duplicate CVEs across pages', async () => {
    const fake = fakeGateway([
      {
        value: { ...nvdBase, format: 'NVD_CVE', vulnerabilities: [{ cve }] },
        obtainedAt: older,
      },
      {
        value: {
          ...nvdBase,
          startIndex: 1,
          format: 'NVD_CVE',
          vulnerabilities: [{ cve }],
        },
        obtainedAt: newer,
      },
    ]);
    const client = new ExternalSourceClients(fake.gateway, {
      nvdPageSize: 1,
      nvdMaxPages: 2,
    });
    await expect(
      client.searchCve(cpe.cpeName, signal, Number.MAX_SAFE_INTEGER),
    ).rejects.toMatchObject({ kind: 'INVALID_RESPONSE' });
  });

  it('loads a complete KEV catalog once for multiple membership checks', async () => {
    const record = {
      cveID: 'CVE-2026-1234',
      vendorProject: 'Example',
      product: 'Router',
      vulnerabilityName: 'Synthetic',
      dateAdded: '2026-11-01',
      shortDescription: 'Synthetic',
      requiredAction: 'Review',
      dueDate: '2026-12-01',
    };
    const fake = fakeGateway([
      {
        value: {
          catalogVersion: 'test',
          dateReleased: '2026-11-14T00:00:00Z',
          count: 1,
          vulnerabilities: [record],
        },
        obtainedAt: older,
      },
    ]);
    const client = new ExternalSourceClients(fake.gateway, {
      nvdPageSize: 1,
      nvdMaxPages: 1,
    });
    const catalog = await client.loadKev(signal, Number.MAX_SAFE_INTEGER);
    expect(catalog.value.contains('CVE-2026-1234')).toBe(true);
    expect(catalog.value.contains('CVE-2026-5678')).toBe(false);
    expect(fake.requests).toEqual([{ kind: 'KEV' }]);
  });

  it('rejects a collection when its budget expires during processing', async () => {
    const fake = fakeGateway([
      {
        value: {
          ...nvdBase,
          totalResults: 1,
          format: 'NVD_CPE',
          products: [{ cpe }],
        },
        obtainedAt: older,
      },
    ]);
    const now = vi.fn().mockReturnValueOnce(0).mockReturnValue(10);
    const client = new ExternalSourceClients(
      fake.gateway,
      { nvdPageSize: 1, nvdMaxPages: 1 },
      now,
    );
    await expect(
      client.searchCpe(identification, signal, 10),
    ).rejects.toMatchObject({ kind: 'TIMEOUT' });
  });
});
