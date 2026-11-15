import { performance } from 'node:perf_hooks';
import { ExternalSourceError } from '../../application/ports/external-source-result.js';

export type ExternalRequest =
  | {
      readonly kind: 'NVD_CPE';
      readonly keyword: string;
      readonly startIndex: number;
      readonly pageSize: number;
    }
  | {
      readonly kind: 'NVD_CVE';
      readonly cpeName: string;
      readonly startIndex: number;
      readonly pageSize: number;
    }
  | { readonly kind: 'KEV' };

export interface TransportPolicy {
  readonly requestTimeoutMs: number;
  readonly nvdMaxResponseBytes: number;
  readonly kevMaxResponseBytes: number;
  readonly nvdApiKey?: string;
}

function destination(request: ExternalRequest): URL {
  if (request.kind === 'KEV')
    return new URL(
      'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
    );
  const url = new URL(
    request.kind === 'NVD_CPE'
      ? 'https://services.nvd.nist.gov/rest/json/cpes/2.0'
      : 'https://services.nvd.nist.gov/rest/json/cves/2.0',
  );
  if (
    !Number.isSafeInteger(request.startIndex) ||
    request.startIndex < 0 ||
    !Number.isSafeInteger(request.pageSize) ||
    request.pageSize < 1 ||
    request.pageSize > 100
  ) {
    throw new Error('Invalid external pagination');
  }
  url.searchParams.set('startIndex', String(request.startIndex));
  url.searchParams.set('resultsPerPage', String(request.pageSize));
  if (request.kind === 'NVD_CPE')
    url.searchParams.set('keywordSearch', request.keyword);
  else url.searchParams.set('cpeName', request.cpeName);
  return url;
}

/** Retry-After is a delay; invalid or unrepresentable values are ignored. */
export function parseRetryAfter(
  value: string | null,
  now: number,
): number | undefined {
  if (value === null) return undefined;
  const text = value.trim();
  if (/^[0-9]+(?![\s\S])/.test(text)) {
    const seconds = Number(text);
    return Number.isSafeInteger(seconds) &&
      seconds <= Number.MAX_SAFE_INTEGER / 1000
      ? seconds * 1000
      : undefined;
  }
  const httpDate =
    /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT|(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), [0-9]{2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT|(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (?: [1-9]|[0-9]{2}) [0-9]{2}:[0-9]{2}:[0-9]{2} [0-9]{4})(?![\s\S])/;
  if (!httpDate.test(text)) return undefined;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, parsed - now);
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/** Fixed HTTPS destinations, no redirects; body bytes are counted after decoding by fetch. */
export class ExternalTransport {
  constructor(
    private readonly policy: TransportPolicy,
    private readonly fetcher: typeof fetch = fetch,
    private readonly monotonicNow: () => number = () => performance.now(),
    private readonly wallNow: () => number = () => Date.now(),
  ) {}

  async getJson(
    request: ExternalRequest,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<unknown> {
    signal.throwIfAborted();
    const url = destination(request);
    const remaining = deadlineAt - this.monotonicNow();
    if (remaining <= 0) throw new ExternalSourceError('TIMEOUT');
    const timeout = new AbortController();
    const timer = setTimeout(
      () => timeout.abort(),
      Math.min(this.policy.requestTimeoutMs, remaining),
    );
    const combined = AbortSignal.any([signal, timeout.signal]);
    const ensureActive = () => {
      signal.throwIfAborted();
      if (timeout.signal.aborted || this.monotonicNow() >= deadlineAt)
        throw new ExternalSourceError('TIMEOUT');
    };
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let response: Response | undefined;
    let completed = false;
    try {
      const headers = new Headers({ Accept: 'application/json' });
      if (request.kind !== 'KEV' && this.policy.nvdApiKey !== undefined)
        headers.set('apiKey', this.policy.nvdApiKey);
      try {
        const pending = this.fetcher(url, {
          method: 'GET',
          headers,
          redirect: 'manual',
          signal: combined,
        });
        void pending.then(
          (late) => {
            if (combined.aborted && late.body !== null && !late.body.locked)
              void late.body.cancel().catch(() => undefined);
          },
          () => undefined,
        );
        response = await withAbort(pending, combined);
      } catch (error) {
        ensureActive();
        if (error instanceof TypeError)
          throw new ExternalSourceError('UNAVAILABLE');
        throw error;
      }
      ensureActive();
      if (response.status !== 200) {
        const retry =
          response.status === 429 || response.status === 503
            ? parseRetryAfter(
                response.headers.get('retry-after'),
                this.wallNow(),
              )
            : undefined;
        throw new ExternalSourceError('UNAVAILABLE', retry);
      }
      const contentType = response.headers
        .get('content-type')
        ?.split(';')
        .map((part) => part.trim().toLowerCase());
      if (
        contentType?.[0] !== 'application/json' ||
        contentType
          .slice(1)
          .some(
            (part) =>
              /^charset\s*=/.test(part) &&
              !/^charset\s*=\s*(?:utf-8|"utf-8")$/.test(part),
          )
      ) {
        throw new ExternalSourceError('INVALID_RESPONSE');
      }
      if (response.body === null)
        throw new ExternalSourceError('INVALID_RESPONSE');
      reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8', { fatal: true });
      const chunks: string[] = [];
      const limit =
        request.kind === 'KEV'
          ? this.policy.kevMaxResponseBytes
          : this.policy.nvdMaxResponseBytes;
      let bytes = 0;
      while (true) {
        let next: ReadableStreamReadResult<Uint8Array>;
        try {
          next = await withAbort(reader.read(), combined);
        } catch (error) {
          ensureActive();
          if (error instanceof TypeError)
            throw new ExternalSourceError('UNAVAILABLE');
          throw error;
        }
        ensureActive();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > limit) throw new ExternalSourceError('INVALID_RESPONSE');
        try {
          chunks.push(decoder.decode(next.value, { stream: true }));
        } catch (error) {
          if (error instanceof TypeError)
            throw new ExternalSourceError('INVALID_RESPONSE');
          throw error;
        }
      }
      try {
        chunks.push(decoder.decode());
      } catch (error) {
        if (error instanceof TypeError)
          throw new ExternalSourceError('INVALID_RESPONSE');
        throw error;
      }
      ensureActive();
      let payload: unknown;
      try {
        payload = JSON.parse(chunks.join(''));
      } catch (error) {
        if (error instanceof SyntaxError)
          throw new ExternalSourceError('INVALID_RESPONSE');
        throw error;
      }
      ensureActive();
      completed = true;
      return payload;
    } finally {
      clearTimeout(timer);
      if (!completed) {
        if (reader !== undefined) void reader.cancel().catch(() => undefined);
        else if (response?.body !== null && response?.body !== undefined)
          void response.body.cancel().catch(() => undefined);
      }
      try {
        reader?.releaseLock();
      } catch {
        /* A pending read is being cancelled. */
      }
    }
  }
}
