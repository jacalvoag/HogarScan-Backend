import { parseKevCatalog } from './parse-kev-catalog.js';

// Synthetic catalog; identifiers are examples and make no claims of exploitation.
describe('KEV catalog parser', () => {
  const entry = {
    vendorProject: 'Example vendor',
    product: 'Example product',
    vulnerabilityName: 'Synthetic vulnerability',
    dateAdded: '2026-11-01',
    shortDescription: 'Synthetic fixture',
    requiredAction: 'Review',
    dueDate: '2026-12-01',
  };
  const catalog = {
    title: 'Synthetic test catalog',
    catalogVersion: '2026.11.11',
    dateReleased: '2026-11-11T00:00:00Z',
    count: 2,
    vulnerabilities: [
      { ...entry, cveID: 'CVE-2026-1111' },
      { ...entry, cveID: 'CVE-2026-2222' },
    ],
  };

  it('checks exact membership only after validating a complete catalog', () => {
    const result = parseKevCatalog(catalog);
    expect(result.catalogVersion).toBe('2026.11.11');
    expect(result.contains('CVE-2026-1111')).toBe(true);
    expect(result.contains('CVE-2026-3333')).toBe(false);
    expect(() => result.contains('cve-2026-1111')).toThrow(
      'Invalid CVE identifier',
    );
    expect(() => result.contains('CVE-2026-1111\n')).toThrow(
      'Invalid CVE identifier',
    );
  });

  it.each([
    null,
    {},
    { ...catalog, count: 3 },
    { ...catalog, count: 0, vulnerabilities: [] },
    { ...catalog, dateReleased: 'invalid' },
    { ...catalog, vulnerabilities: [{ ...entry, cveID: 'CVE-2026-1111' }] },
    {
      ...catalog,
      vulnerabilities: [
        { ...entry, cveID: 'CVE-2026-1111' },
        { ...entry, cveID: 'CVE-2026-1111' },
      ],
    },
    {
      ...catalog,
      vulnerabilities: [
        { ...entry, cveID: 'bad' },
        { ...entry, cveID: 'CVE-2026-2222' },
      ],
    },
    {
      ...catalog,
      vulnerabilities: [
        { cveID: 'CVE-2026-1111' },
        { ...entry, cveID: 'CVE-2026-2222' },
      ],
    },
  ])('rejects malformed or incomplete catalogs %#', (payload) => {
    expect(() => parseKevCatalog(payload)).toThrow('Invalid KEV catalog');
  });
});
