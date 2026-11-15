import { collectCpePages } from '../../application/collect-cpe-pages.js';
import { performance } from 'node:perf_hooks';
import { collectNvdPages } from '../../application/collect-nvd-pages.js';
import { ExternalSourceError } from '../../application/ports/external-source-result.js';
import type { SourcedValue } from '../../application/ports/external-source-result.js';
import type {
  CpeDictionaryCandidate,
  CpeDictionaryPage,
} from '../../application/ports/cpe-dictionary.js';
import type {
  KevCatalog,
  NvdCandidate,
  NvdCandidatePage,
} from '../../application/ports/vulnerability-sources.js';
import { parseCpeDictionaryPage } from '../nvd/parse-cpe-dictionary-page.js';
import { parseNvdPage } from '../nvd/parse-nvd-page.js';
import { parseKevCatalog } from '../kev/parse-kev-catalog.js';
import type { ExternalJsonGateway } from './external-json-gateway.js';

interface PagePolicy {
  readonly nvdPageSize: number;
  readonly nvdMaxPages: number;
}

export class ExternalSourceClients {
  constructor(
    private readonly gateway: Pick<ExternalJsonGateway, 'get'>,
    private readonly policy: PagePolicy,
    private readonly now: () => number = () => performance.now(),
  ) {
    if (
      !Number.isSafeInteger(policy.nvdPageSize) ||
      policy.nvdPageSize < 1 ||
      policy.nvdPageSize > 100 ||
      !Number.isSafeInteger(policy.nvdMaxPages) ||
      policy.nvdMaxPages < 1
    )
      throw new Error('Invalid external page policy');
  }

  private ensureActive(signal: AbortSignal, deadlineAt: number): void {
    signal.throwIfAborted();
    if (this.now() >= deadlineAt) throw new ExternalSourceError('TIMEOUT');
  }

  async searchCpe(
    matchString: string,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<SourcedValue<readonly CpeDictionaryCandidate[]>> {
    const pages: CpeDictionaryPage[] = [];
    let oldest = Infinity;
    for (let index = 0; index < this.policy.nvdMaxPages; index++) {
      this.ensureActive(signal, deadlineAt);
      const startIndex = pages.reduce(
        (sum, page) => sum + page.candidates.length,
        0,
      );
      const result = await this.gateway.get(
        {
          kind: 'NVD_CPE',
          matchString,
          startIndex,
          pageSize: this.policy.nvdPageSize,
        },
        parseCpeDictionaryPage,
        signal,
        deadlineAt,
      );
      signal.throwIfAborted();
      pages.push(result.value);
      oldest = Math.min(oldest, result.obtainedAt.getTime());
      const collection = collectCpePages(pages);
      this.ensureActive(signal, deadlineAt);
      if (collection.state === 'PAGES_COMPLETE')
        return { value: collection.candidates, obtainedAt: new Date(oldest) };
    }
    throw new ExternalSourceError('UNAVAILABLE');
  }

  async searchCve(
    cpeName: string,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<SourcedValue<readonly NvdCandidate[]>> {
    if (!cpeName.startsWith('cpe:2.3:'))
      throw new Error('Invalid resolved CPE');
    const pages: NvdCandidatePage[] = [];
    let oldest = Infinity;
    for (let index = 0; index < this.policy.nvdMaxPages; index++) {
      this.ensureActive(signal, deadlineAt);
      const startIndex = pages.reduce(
        (sum, page) => sum + page.candidates.length,
        0,
      );
      const result = await this.gateway.get(
        {
          kind: 'NVD_CVE',
          cpeName,
          startIndex,
          pageSize: this.policy.nvdPageSize,
        },
        parseNvdPage,
        signal,
        deadlineAt,
      );
      signal.throwIfAborted();
      pages.push(result.value);
      oldest = Math.min(oldest, result.obtainedAt.getTime());
      const collection = collectNvdPages(pages);
      this.ensureActive(signal, deadlineAt);
      if (collection.state === 'PAGES_COMPLETE')
        return { value: collection.candidates, obtainedAt: new Date(oldest) };
    }
    throw new ExternalSourceError('UNAVAILABLE');
  }

  loadKev(
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<SourcedValue<KevCatalog>> {
    return this.gateway.get(
      { kind: 'KEV' },
      parseKevCatalog,
      signal,
      deadlineAt,
    );
  }
}
