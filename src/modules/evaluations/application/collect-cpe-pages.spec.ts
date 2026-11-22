import { collectCpePages } from './collect-cpe-pages.js';
import type {
  CpeDictionaryCandidate,
  CpeDictionaryPage,
} from './ports/cpe-dictionary.js';

describe('CPE dictionary page collection', () => {
  const first: CpeDictionaryCandidate = {
    id: 'first-id',
    name: 'candidate one',
    deprecated: false,
    titles: [],
    replacementIds: [],
  };
  const second: CpeDictionaryCandidate = {
    id: 'second-id',
    name: 'candidate two',
    deprecated: true,
    titles: [],
    replacementIds: [],
  };
  const page: CpeDictionaryPage = {
    startIndex: 0,
    resultsPerPage: 1,
    totalResults: 2,
    candidates: [first],
  };

  it('marks a single incomplete page as partial without choosing a product', () => {
    expect(collectCpePages([page])).toEqual({
      state: 'PAGES_PARTIAL',
      totalResults: 2,
      candidates: [first],
    });
  });

  it('collects consecutive pages including deprecated entries without selecting one', () => {
    expect(
      collectCpePages([page, { ...page, startIndex: 1, candidates: [second] }]),
    ).toEqual({
      state: 'PAGES_COMPLETE',
      totalResults: 2,
      candidates: [first, second],
    });
  });

  it('distinguishes a complete empty result from no pages', () => {
    expect(
      collectCpePages([
        { startIndex: 0, resultsPerPage: 0, totalResults: 0, candidates: [] },
      ]),
    ).toEqual({ state: 'PAGES_COMPLETE', totalResults: 0, candidates: [] });
    expect(() => collectCpePages([])).toThrow(
      'At least one CPE page is required',
    );
    const empty = {
      startIndex: 0,
      resultsPerPage: 0,
      totalResults: 0,
      candidates: [],
    };
    expect(() => collectCpePages([empty, empty])).toThrow(
      'Inconsistent CPE pages',
    );
  });

  it.each([
    { pages: [{ ...page, startIndex: 1 }] },
    { pages: [page, { ...page, startIndex: 0, candidates: [second] }] },
    { pages: [page, { ...page, startIndex: 2, candidates: [second] }] },
    {
      pages: [
        page,
        { ...page, startIndex: 1, totalResults: 3, candidates: [second] },
      ],
    },
    {
      pages: [
        page,
        { ...page, startIndex: 1, candidates: [{ ...first, id: 'FIRST-ID' }] },
      ],
    },
    { pages: [page, { ...page, startIndex: 1, candidates: [] }] },
    { pages: [{ ...page, resultsPerPage: 0 }] },
  ])(
    'rejects gaps, inconsistent totals or repeated identifiers %#',
    ({ pages }) => {
      expect(() => collectCpePages(pages)).toThrow('Inconsistent CPE pages');
    },
  );
});
