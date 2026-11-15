import { performance } from 'node:perf_hooks';
import { ExternalSourceError } from '../../application/ports/external-source-result.js';
import type { SourcedValue } from '../../application/ports/external-source-result.js';
import { ExternalJsonCache, externalCacheKey } from './external-json-cache.js';
import { ExternalScheduler } from './external-scheduler.js';
import type {
  ExternalRequest,
  ExternalTransport,
} from './external-transport.js';

/** Validates before caching and rechecks shared cache while queued. */
export class ExternalJsonGateway {
  constructor(
    private readonly enabled: boolean,
    private readonly cache: ExternalJsonCache,
    private readonly scheduler: ExternalScheduler,
    private readonly transport: Pick<ExternalTransport, 'getJson'>,
    private readonly now: () => number = () => performance.now(),
    private readonly wallNow: () => Date = () => new Date(),
  ) {}

  async get<T>(
    request: ExternalRequest,
    parse: (payload: unknown) => T,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<SourcedValue<T>> {
    if (!this.enabled) throw new Error('External sources are disabled');
    const ensureActive = () => {
      signal.throwIfAborted();
      if (this.now() >= deadlineAt) throw new ExternalSourceError('TIMEOUT');
    };
    const key = externalCacheKey(request);
    const cached = (): SourcedValue<T> | undefined => {
      ensureActive();
      const entry = this.cache.get(key);
      if (entry === undefined) return undefined;
      const value = parse(entry.value);
      ensureActive();
      return { value, obtainedAt: entry.obtainedAt };
    };
    const first = cached();
    if (first !== undefined) return first;

    return this.scheduler.schedule<SourcedValue<T>>(
      request.kind === 'KEV' ? 'KEV' : 'NVD',
      deadlineAt,
      signal,
      async () => {
        ensureActive();
        const payload = await this.transport.getJson(
          request,
          signal,
          deadlineAt,
        );
        ensureActive();
        const obtainedAt = this.wallNow();
        const obtainedMonotonic = this.now();
        const value = parse(payload);
        ensureActive();
        this.cache.put(
          key,
          payload,
          obtainedAt,
          obtainedMonotonic,
          signal,
          deadlineAt,
        );
        return { value, obtainedAt };
      },
      () => {
        const value = cached();
        return value === undefined ? { hit: false } : { hit: true, value };
      },
    );
  }
}
