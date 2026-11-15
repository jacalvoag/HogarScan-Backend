import { performance } from 'node:perf_hooks';
import type { SourcedValue } from '../../application/ports/external-source-result.js';
import type { ExternalRequest } from './external-transport.js';

export interface CachePolicy {
  readonly enabled: boolean;
  readonly cacheTtlSeconds: number;
  readonly cacheMaxEntries: number;
  readonly cacheMaxBytes: number;
}

interface CacheEntry {
  readonly json: string;
  readonly acquiredMs: number;
  readonly expiresAt: number;
  readonly bytes: number;
}

/** Keys contain the effective provider query, never session data or API keys. */
export function externalCacheKey(request: ExternalRequest): string {
  switch (request.kind) {
    case 'NVD_CPE':
      return JSON.stringify([
        request.kind,
        request.keyword,
        request.startIndex,
        request.pageSize,
      ]);
    case 'NVD_CVE':
      return JSON.stringify([
        request.kind,
        request.cpeName,
        request.startIndex,
        request.pageSize,
      ]);
    case 'KEV':
      return JSON.stringify([request.kind]);
  }
}

/** Cache validated JSON only. Returned objects and dates are defensive copies. */
export class ExternalJsonCache {
  private readonly entries = new Map<string, CacheEntry>();
  private totalBytes = 0;
  constructor(
    private readonly policy: CachePolicy,
    private readonly now: () => number = () => performance.now(),
  ) {
    if (
      !Number.isSafeInteger(policy.cacheMaxEntries) ||
      policy.cacheMaxEntries < 1 ||
      !Number.isSafeInteger(policy.cacheMaxBytes) ||
      policy.cacheMaxBytes < 1 ||
      !Number.isFinite(policy.cacheTtlSeconds) ||
      policy.cacheTtlSeconds <= 0
    )
      throw new Error('Invalid external cache policy');
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (entry !== undefined) {
      this.totalBytes -= entry.bytes;
      this.entries.delete(key);
    }
  }

  private removeExpired(): void {
    const now = this.now();
    for (const [key, entry] of this.entries)
      if (entry.expiresAt <= now) this.remove(key);
  }

  get(key: string): SourcedValue<unknown> | undefined {
    if (!this.policy.enabled) return undefined;
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.remove(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return {
      value: JSON.parse(entry.json) as unknown,
      obtainedAt: new Date(entry.acquiredMs),
    };
  }

  put(
    key: string,
    value: unknown,
    obtainedAt: Date,
    obtainedMonotonic: number,
    signal: AbortSignal,
    deadlineAt: number,
  ): boolean {
    if (!this.policy.enabled || signal.aborted || this.now() >= deadlineAt)
      return false;
    const acquiredMs = obtainedAt.getTime();
    if (
      !Number.isFinite(acquiredMs) ||
      !Number.isFinite(obtainedMonotonic) ||
      obtainedMonotonic > this.now()
    )
      throw new Error('Invalid cache acquisition time');
    const expiresAt = obtainedMonotonic + this.policy.cacheTtlSeconds * 1000;
    if (expiresAt <= this.now()) return false;
    const json = JSON.stringify(value);
    if (json === undefined) throw new Error('Cache value is not JSON');
    const bytes =
      Buffer.byteLength(key, 'utf8') + Buffer.byteLength(json, 'utf8');
    if (bytes > this.policy.cacheMaxBytes) return false;
    if (signal.aborted || this.now() >= deadlineAt) return false;

    this.removeExpired();
    this.remove(key);
    while (
      this.entries.size >= this.policy.cacheMaxEntries ||
      this.totalBytes + bytes > this.policy.cacheMaxBytes
    ) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.remove(oldest);
    }
    this.entries.set(key, { json, acquiredMs, expiresAt, bytes });
    this.totalBytes += bytes;
    return true;
  }
}
