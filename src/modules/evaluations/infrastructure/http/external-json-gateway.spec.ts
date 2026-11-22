import { InvalidExternalPayloadError } from '../../application/ports/external-source-result.js';
import { ExternalJsonCache, externalCacheKey } from './external-json-cache.js';
import { ExternalJsonGateway } from './external-json-gateway.js';
import { ExternalScheduler } from './external-scheduler.js';
import { ExternalTransport } from './external-transport.js';
import type { ExternalRequest } from './external-transport.js';

describe('Shared external JSON gateway', () => {
  let time = 0;
  const date = new Date('2026-11-14T00:00:00Z');
  const signal = () => new AbortController().signal;
  const request: ExternalRequest = {
    kind: 'NVD_CPE',
    matchString: 'cpe:2.3:*:Example:Device:1',
    startIndex: 0,
    pageSize: 10,
  };
  const cveRequest: ExternalRequest = {
    kind: 'NVD_CVE',
    cpeName: 'cpe:2.3:h:example:device:1:*:*:*:*:*:*:*',
    startIndex: 0,
    pageSize: 10,
  };
  const kevRequest = { kind: 'KEV' } as const;
  const validJson = () =>
    new Response('{"valid":true}', {
      headers: { 'content-type': 'application/json' },
    });
  const tick = async (milliseconds: number) => {
    time += milliseconds;
    await vi.advanceTimersByTimeAsync(milliseconds);
  };
  const parse = (value: unknown) => {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('valid' in value) ||
      value.valid !== true
    )
      throw new InvalidExternalPayloadError('CPE');
    return { valid: true };
  };
  const make = (enabled = true, fetcher?: typeof fetch) => {
    const now = () => time;
    const cache = new ExternalJsonCache(
      {
        enabled: true,
        cacheTtlSeconds: 10,
        cacheMaxEntries: 5,
        cacheMaxBytes: 1000,
      },
      now,
    );
    const scheduler = new ExternalScheduler(
      {
        maxConcurrentRequests: 1,
        maxQueuedRequests: 4,
        nvdMinIntervalMs: 1000,
      },
      now,
    );
    const getJson = vi.fn<ExternalTransport['getJson']>();
    const transport =
      fetcher === undefined
        ? { getJson }
        : new ExternalTransport(
            {
              requestTimeoutMs: 5000,
              nvdMaxResponseBytes: 1000,
              kevMaxResponseBytes: 1000,
            },
            fetcher,
            now,
            () => date.getTime() + time,
          );
    const gateway = new ExternalJsonGateway(
      enabled,
      cache,
      scheduler,
      transport,
      now,
      () => date,
    );
    return { cache, gateway, getJson };
  };
  beforeEach(() => {
    time = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not use HTTP or cache when disabled', async () => {
    const { gateway, cache, getJson } = make(false);
    const spy = vi.spyOn(cache, 'get');
    await expect(gateway.get(request, parse, signal(), 5000)).rejects.toThrow(
      'External sources are disabled',
    );
    expect(spy).not.toHaveBeenCalled();
    expect(getJson).not.toHaveBeenCalled();
  });

  it('shares validated data between concurrent callers and preserves the original date', async () => {
    const { gateway, getJson } = make();
    let release: ((value: unknown) => void) | undefined;
    getJson.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = gateway.get(request, parse, signal(), 5000);
    const second = gateway.get(request, parse, signal(), 5000);
    release?.({ valid: true });
    await expect(first).resolves.toEqual({
      value: { valid: true },
      obtainedAt: date,
    });
    await expect(second).resolves.toEqual({
      value: { valid: true },
      obtainedAt: date,
    });
    expect(getJson).toHaveBeenCalledTimes(1);
    time = 500;
    await expect(gateway.get(request, parse, signal(), 5000)).resolves.toEqual({
      value: { valid: true },
      obtainedAt: date,
    });
    expect(getJson).toHaveBeenCalledTimes(1);
  });

  it('does not cache invalid provider data or present it as an empty result', async () => {
    const { gateway, getJson } = make();
    getJson.mockResolvedValueOnce({ private: 'bad' });
    await expect(
      gateway.get({ kind: 'KEV' }, parse, signal(), 5000),
    ).rejects.toBeInstanceOf(InvalidExternalPayloadError);
    getJson.mockResolvedValueOnce({ valid: true });
    await expect(
      gateway.get({ kind: 'KEV' }, parse, signal(), 5000),
    ).resolves.toEqual({ value: { valid: true }, obtainedAt: date });
    expect(getJson).toHaveBeenCalledTimes(2);
  });

  it('descarta el resultado si la validación agota el presupuesto', async () => {
    const { gateway, getJson, cache } = make();
    getJson.mockResolvedValueOnce({ valid: true });
    const slowParse = (value: unknown) => {
      time = 10;
      return parse(value);
    };
    await expect(
      gateway.get(kevRequest, slowParse, signal(), 10),
    ).rejects.toMatchObject({ kind: 'TIMEOUT' });
    expect(cache.get(externalCacheKey(kevRequest))).toBeUndefined();
  });

  it('aplica el intervalo común de CPE y CVE y deja leer caché durante Retry-After', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(validJson())
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { 'retry-after': '3' } }),
      )
      .mockResolvedValueOnce(validJson());
    const { gateway } = make(true, fetcher);
    const original = await gateway.get(request, parse, signal(), 5000);
    const throttled = expect(
      gateway.get(cveRequest, parse, signal(), 5000),
    ).rejects.toMatchObject({ kind: 'UNAVAILABLE', retryAfterMs: 3000 });
    await tick(999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await tick(1);
    await throttled;
    expect(fetcher).toHaveBeenCalledTimes(2);
    const retry = gateway.get(cveRequest, parse, signal(), 5000);
    await tick(2999);
    expect(await gateway.get(request, parse, signal(), 5000)).toEqual(original);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await tick(1);
    await expect(retry).resolves.toMatchObject({ value: { valid: true } });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('libera el turno cancelado, descarta su respuesta tardía y no inicia el trabajo retirado de la cola', async () => {
    vi.useFakeTimers();
    const active = new AbortController();
    const queued = new AbortController();
    let sendLateResponse: (response: Response) => void = () => undefined;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            sendLateResponse = resolve;
          }),
      )
      .mockResolvedValueOnce(validJson());
    const { gateway, cache } = make(true, fetcher);
    const stopped = expect(
      gateway.get(kevRequest, parse, active.signal, 5000),
    ).rejects.toMatchObject({ name: 'AbortError' });
    const removed = expect(
      gateway.get(request, parse, queued.signal, 5000),
    ).rejects.toMatchObject({ name: 'AbortError' });
    const next = gateway.get(cveRequest, parse, signal(), 5000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    queued.abort();
    active.abort();
    await Promise.all([stopped, removed]);
    await expect(next).resolves.toMatchObject({ value: { valid: true } });

    const cancel = vi.fn();
    sendLateResponse(
      new Response(new ReadableStream({ cancel }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    await tick(1000);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(cache.get(externalCacheKey(request))).toBeUndefined();
    expect(cache.get(externalCacheKey(kevRequest))).toBeUndefined();
  });

  it('usa el presupuesto restante después de la cola y del intervalo para la lectura HTTP', async () => {
    vi.useFakeTimers();
    let release: (response: Response) => void = () => undefined;
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{'));
      },
      cancel,
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValueOnce(
        new Response(stream, {
          headers: { 'content-type': 'application/json' },
        }),
      );
    const { gateway, cache } = make(true, fetcher);
    const first = gateway.get(request, parse, signal(), 5000);
    const due = expect(
      gateway.get(cveRequest, parse, signal(), 1300),
    ).rejects.toMatchObject({ kind: 'TIMEOUT' });
    await tick(400);
    release(validJson());
    await first;
    await tick(599);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await tick(299);
    expect(cancel).not.toHaveBeenCalled();
    await tick(1);
    await due;
    expect(cancel).toHaveBeenCalledOnce();
    expect(cache.get(externalCacheKey(cveRequest))).toBeUndefined();
  });
});
