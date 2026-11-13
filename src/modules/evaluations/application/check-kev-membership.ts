import type { KevCatalogSource } from './ports/vulnerability-sources.js';

export type KevLookupResult =
  | {
      readonly state: 'NOT_QUERIED';
      readonly checkedAt: null;
      readonly inKev: null;
    }
  | {
      readonly state: 'UNAVAILABLE';
      readonly checkedAt: Date;
      readonly inKev: null;
    }
  | {
      readonly state: 'AVAILABLE';
      readonly checkedAt: Date;
      readonly inKev: boolean;
    };

/** Only call with a CVE whose possible applicability was independently substantiated. */
export class CheckKevMembership {
  constructor(
    private readonly source: KevCatalogSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    cve: string | undefined,
    signal: AbortSignal,
  ): Promise<KevLookupResult> {
    if (cve === undefined)
      return { state: 'NOT_QUERIED', checkedAt: null, inKev: null };
    if (!/^CVE-[0-9]{4}-[0-9]{4,}(?![\s\S])/.test(cve))
      throw new Error('Invalid CVE identifier');
    signal.throwIfAborted();
    try {
      const catalog = await this.source.load(signal);
      signal.throwIfAborted();
      const inKev = catalog.contains(cve);
      return { state: 'AVAILABLE', checkedAt: this.now(), inKev };
    } catch {
      signal.throwIfAborted();
      return { state: 'UNAVAILABLE', checkedAt: this.now(), inKev: null };
    }
  }
}
