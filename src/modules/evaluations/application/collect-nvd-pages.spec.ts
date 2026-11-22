import { collectNvdPages } from './collect-nvd-pages.js';
import type {
  NvdCandidate,
  NvdCandidatePage,
} from './ports/vulnerability-sources.js';

describe('NVD page collection', () => {
  const first: NvdCandidate = {
    cve: 'CVE-2026-1111',
    status: 'Analyzed',
    configurations: null,
    hasUnparsedAffectedData: false,
  };
  const second: NvdCandidate = { ...first, cve: 'CVE-2026-2222' };
  const page: NvdCandidatePage = {
    startIndex: 0,
    resultsPerPage: 1,
    totalResults: 2,
    candidates: [first],
  };

  it('distinguishes partial and complete collections', () => {
    expect(collectNvdPages([page])).toMatchObject({
      state: 'PAGES_PARTIAL',
      candidates: [first],
    });
    expect(
      collectNvdPages([page, { ...page, startIndex: 1, candidates: [second] }]),
    ).toMatchObject({ state: 'PAGES_COMPLETE', candidates: [first, second] });
  });

  it('accepts a complete empty response', () => {
    expect(
      collectNvdPages([
        { startIndex: 0, resultsPerPage: 0, totalResults: 0, candidates: [] },
      ]),
    ).toEqual({ state: 'PAGES_COMPLETE', totalResults: 0, candidates: [] });
  });

  it.each([
    { pages: [page, { ...page, startIndex: 2, candidates: [second] }] },
    {
      pages: [
        page,
        { ...page, startIndex: 1, totalResults: 3, candidates: [second] },
      ],
    },
    { pages: [page, { ...page, startIndex: 1, candidates: [first] }] },
    { pages: [page, { ...page, startIndex: 1, candidates: [] }] },
  ])('rejects missing, repeated or inconsistent pages %#', ({ pages }) => {
    expect(() => collectNvdPages(pages)).toThrow(
      expect.objectContaining({ kind: 'INVALID_RESPONSE' }),
    );
  });
});
