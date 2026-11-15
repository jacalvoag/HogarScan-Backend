import type { ProductIdentification } from '../domain/product-identification.js';
import { ExternalSourceError } from './ports/external-source-result.js';
import type {
  NvdCandidatePage,
  NvdCandidateSource,
} from './ports/vulnerability-sources.js';

export type NvdLookupResult =
  | { readonly state: 'NOT_QUERIED'; readonly checkedAt: null }
  | {
      readonly state: 'AVAILABLE';
      readonly checkedAt: Date;
      readonly page: NvdCandidatePage;
    }
  | { readonly state: 'UNAVAILABLE'; readonly checkedAt: Date };

/** A failed source is distinct from a successful search without candidates. */
export class FindNvdCandidates {
  constructor(
    private readonly source: NvdCandidateSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    identification: ProductIdentification | undefined,
    signal: AbortSignal,
  ): Promise<NvdLookupResult> {
    if (identification === undefined)
      return { state: 'NOT_QUERIED', checkedAt: null };
    signal.throwIfAborted();
    try {
      const { value: page, obtainedAt } = await this.source.search(
        identification,
        0,
        signal,
      );
      signal.throwIfAborted();
      return { state: 'AVAILABLE', checkedAt: obtainedAt, page };
    } catch (error) {
      signal.throwIfAborted();
      if (!(error instanceof ExternalSourceError)) throw error;
      return { state: 'UNAVAILABLE', checkedAt: this.now() };
    }
  }
}
