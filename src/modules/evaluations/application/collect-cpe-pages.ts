import type {
  CpeDictionaryCandidate,
  CpeDictionaryPage,
} from './ports/cpe-dictionary.js';

export interface CpePageCollection {
  readonly state: 'PAGES_COMPLETE' | 'PAGES_PARTIAL';
  readonly totalResults: number;
  readonly candidates: readonly CpeDictionaryCandidate[];
}

/** Checks offsets, not whether NVD changed records while pages were fetched. */
export function collectCpePages(
  pages: readonly CpeDictionaryPage[],
): CpePageCollection {
  const first = pages[0];
  if (first === undefined) throw new Error('At least one CPE page is required');
  const total = first.totalResults;
  if (!Number.isSafeInteger(total) || total < 0)
    throw new Error('Inconsistent CPE pages');
  const seen = new Set<string>();
  const candidates: CpeDictionaryCandidate[] = [];

  for (const page of pages) {
    if (
      page.totalResults !== total ||
      page.startIndex !== candidates.length ||
      !Number.isSafeInteger(page.resultsPerPage) ||
      page.resultsPerPage < page.candidates.length ||
      (page.candidates.length === 0 && candidates.length < total) ||
      candidates.length + page.candidates.length > total
    ) {
      throw new Error('Inconsistent CPE pages');
    }
    for (const candidate of page.candidates) {
      const key = candidate.id.toLowerCase();
      if (seen.has(key)) throw new Error('Inconsistent CPE pages');
      seen.add(key);
      candidates.push(candidate);
    }
  }

  return {
    state: candidates.length === total ? 'PAGES_COMPLETE' : 'PAGES_PARTIAL',
    totalResults: total,
    candidates,
  };
}
