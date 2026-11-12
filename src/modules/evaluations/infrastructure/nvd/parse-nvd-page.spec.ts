import { parseNvdPage } from './parse-nvd-page.js';

// Synthetic API 2.0 fixtures; no provider response or device data is stored.
describe('NVD candidate page parser', () => {
  const record = {
    published: '2026-11-11T00:00:00.000',
    lastModified: '2026-11-11T00:00:00.000',
    descriptions: [{ lang: 'en', value: 'Synthetic fixture' }],
    references: [],
  };
  const configurations = [
    {
      operator: 'AND',
      negate: false,
      nodes: [
        {
          operator: 'OR',
          cpeMatch: [
            {
              vulnerable: true,
              criteria: 'cpe:2.3:a:example:device:*:*:*:*:*:*:*:*',
              matchCriteriaId: '00000000-0000-4000-8000-000000000001',
              versionStartIncluding: '1.0',
              versionEndExcluding: '2.0',
            },
          ],
        },
        {
          operator: 'OR',
          negate: true,
          cpeMatch: [
            {
              vulnerable: false,
              criteria: 'cpe:2.3:o:example:platform:*:*:*:*:*:*:*:*',
              matchCriteriaId: '00000000-0000-4000-8000-000000000002',
            },
          ],
        },
      ],
    },
  ];
  const page = {
    resultsPerPage: 2,
    startIndex: 0,
    totalResults: 3,
    format: 'NVD_CVE',
    version: '2.0',
    timestamp: '2026-11-11T00:00:00.000',
    vulnerabilities: [
      {
        cve: {
          ...record,
          id: 'CVE-2026-1234',
          vulnStatus: 'Analyzed',
          configurations,
        },
      },
      { cve: { ...record, id: 'CVE-2026-12345' } },
    ],
  };

  it('normalizes candidates and preserves pagination without claiming applicability', () => {
    expect(parseNvdPage(page)).toEqual({
      startIndex: 0,
      resultsPerPage: 2,
      totalResults: 3,
      candidates: [
        { cve: 'CVE-2026-1234', status: 'Analyzed', configurations },
        { cve: 'CVE-2026-12345', status: null, configurations: null },
      ],
    });
  });

  it('accepts a valid empty page as a successful empty result', () => {
    expect(
      parseNvdPage({
        ...page,
        resultsPerPage: 0,
        totalResults: 0,
        vulnerabilities: [],
      }).candidates,
    ).toEqual([]);
  });

  it.each([
    null,
    {},
    { ...page, format: 'other' },
    { ...page, version: '1.0' },
    { ...page, timestamp: 'not-a-date' },
    { ...page, totalResults: 1 },
    { ...page, resultsPerPage: 1 },
    { ...page, startIndex: -1 },
    { ...page, vulnerabilities: [{ cve: { ...record, id: 'cve-2026-1234' } }] },
    { ...page, vulnerabilities: [{ cve: { id: 'CVE-2026-1234' } }] },
    {
      ...page,
      vulnerabilities: [
        {
          cve: {
            ...record,
            id: 'CVE-2026-1234',
            configurations: [{ nodes: [], unknownCondition: true }],
          },
        },
      ],
    },
    {
      ...page,
      vulnerabilities: [
        { cve: { ...record, id: 'CVE-2026-1234' } },
        { cve: { ...record, id: 'CVE-2026-1234' } },
      ],
    },
  ])(
    'rejects invalid or inconsistent responses without exposing them %#',
    (payload) => {
      expect(() => parseNvdPage(payload)).toThrow('Invalid NVD response');
    },
  );
});
