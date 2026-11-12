import { parseCpeDictionaryPage } from './parse-cpe-dictionary-page.js';

// Synthetic fixtures, based on the NVD CPE API 2.0 schema.
describe('CPE dictionary page parser', () => {
  const name = String.raw`cpe:2.3:a:example:my\:device:1.0.0:*:*:*:*:*:*:*`;
  const record = {
    cpeName: name,
    cpeNameId: '00000000-0000-4000-8000-000000000001',
    deprecated: false,
    created: '2026-11-11T00:00:00.000',
    lastModified: '2026-11-11T00:00:00.000',
    titles: [{ title: 'Example Device', lang: 'en' }],
  };
  const page = {
    resultsPerPage: 1,
    startIndex: 0,
    totalResults: 2,
    format: 'NVD_CPE',
    version: '2.0',
    timestamp: '2026-11-11T00:00:00.000',
    products: [{ cpe: record }],
  };

  it('preserves escaped names, titles, identifiers and pagination as candidates', () => {
    expect(parseCpeDictionaryPage(page)).toEqual({
      resultsPerPage: 1,
      startIndex: 0,
      totalResults: 2,
      candidates: [
        {
          id: record.cpeNameId,
          name,
          deprecated: false,
          titles: [{ text: 'Example Device', language: 'en' }],
          replacementIds: [],
        },
      ],
    });
  });

  it('retains deprecation and replacement identifiers without choosing a replacement', () => {
    const replacement = {
      cpeName: name,
      cpeNameId: '00000000-0000-4000-8000-000000000002',
    };
    const result = parseCpeDictionaryPage({
      ...page,
      products: [
        { cpe: { ...record, deprecated: true, deprecatedBy: [replacement] } },
      ],
    });
    expect(result.candidates[0]).toMatchObject({
      deprecated: true,
      replacementIds: [replacement.cpeNameId],
    });
  });

  it('accepts an empty result without inferring product absence', () => {
    expect(
      parseCpeDictionaryPage({
        ...page,
        resultsPerPage: 0,
        totalResults: 0,
        products: [],
      }).candidates,
    ).toEqual([]);
  });

  it.each([
    null,
    {},
    { ...page, format: 'NVD_CVE' },
    { ...page, timestamp: 'invalid' },
    { ...page, products: [] },
    { ...page, totalResults: 0 },
    { ...page, products: [{ cpe: { ...record, cpeNameId: 'invalid' } }] },
    { ...page, products: [{ cpe: { ...record, deprecated: 'false' } }] },
    { ...page, products: [{ cpe: { ...record, cpeName: 'not-cpe' } }] },
    { ...page, products: [{ cpe: { ...record, titles: [{ title: 'x' }] } }] },
    {
      ...page,
      resultsPerPage: 2,
      products: [
        { cpe: record },
        { cpe: { ...record, cpeNameId: record.cpeNameId.toUpperCase() } },
      ],
    },
  ])('rejects invalid response metadata or records %#', (payload) => {
    expect(() => parseCpeDictionaryPage(payload)).toThrow(
      'Invalid CPE dictionary response',
    );
  });
});
