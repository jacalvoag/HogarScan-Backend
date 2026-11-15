import { ExternalSourceError } from './ports/external-source-result.js';
import type {
  NvdCandidate,
  NvdCandidatePage,
} from './ports/vulnerability-sources.js';

export interface NvdPageCollection {
  readonly state: 'PAGES_COMPLETE' | 'PAGES_PARTIAL';
  readonly totalResults: number;
  readonly candidates: readonly NvdCandidate[];
}

/** Checks offsets and duplicate IDs; it cannot guarantee a stable provider snapshot. */
export function collectNvdPages(
  pages: readonly NvdCandidatePage[],
): NvdPageCollection {
  const first = pages[0];
  if (first === undefined) throw new Error('At least one NVD page is required');
  const total = first.totalResults;
  if (!Number.isSafeInteger(total) || total < 0)
    throw new ExternalSourceError('INVALID_RESPONSE');
  const seen = new Set<string>();
  const candidates: NvdCandidate[] = [];
  for (const [index, page] of pages.entries()) {
    if (
      page.totalResults !== total ||
      (index > 0 && candidates.length === total) ||
      page.startIndex !== candidates.length ||
      !Number.isSafeInteger(page.resultsPerPage) ||
      page.resultsPerPage < page.candidates.length ||
      (page.candidates.length === 0 && candidates.length < total) ||
      candidates.length + page.candidates.length > total
    ) {
      throw new ExternalSourceError('INVALID_RESPONSE');
    }
    for (const candidate of page.candidates) {
      const key = candidate.cve.toLowerCase();
      if (seen.has(key)) throw new ExternalSourceError('INVALID_RESPONSE');
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
