import { ExternalTransport, parseRetryAfter } from './external-transport.js';
import type { ExternalRequest, TransportPolicy } from './external-transport.js';

describe('External provider transport', () => {
  const policy: TransportPolicy = {
    requestTimeoutMs: 1000,
    nvdMaxResponseBytes: 100,
    kevMaxResponseBytes: 200,
    nvdApiKey: 'test-key',
  };
  const cpe: ExternalRequest = {
    kind: 'NVD_CPE',
    matchString: 'cpe:2.3:*:Example:Device:1',
    startIndex: 0,
    pageSize: 5,
  };
  const ok = () =>
    new Response('{"items":[]}', {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  const signal = () => new AbortController().signal;
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses fixed destinations, no redirects, and sends the key only to NVD', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok());
    const transport = new ExternalTransport(policy, fetcher, () => 0);
    await expect(transport.getJson(cpe, signal(), 10000)).resolves.toEqual({
      items: [],
    });
    const [url, init] = fetcher.mock.calls[0];
    expect((url as URL).toString()).toBe(
      'https://services.nvd.nist.gov/rest/json/cpes/2.0?startIndex=0&resultsPerPage=5&cpeMatchString=cpe%3A2.3%3A*%3AExample%3ADevice%3A1',
    );
    expect(init?.redirect).toBe('manual');
    expect(new Headers(init?.headers).get('apiKey')).toBe('test-key');
    expect((url as URL).toString()).not.toContain('test-key');

    fetcher.mockResolvedValueOnce(ok());
    await transport.getJson({ kind: 'KEV' }, signal(), 10000);
    expect((fetcher.mock.calls[1][0] as URL).toString()).toBe(
      'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
    );
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).has('apiKey')).toBe(
      false,
    );
  });

  it.each([
    new Response('no', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
    new Response('{}', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }),
    new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-16' },
    }),
    new Response('{}', {
      status: 302,
      headers: { location: 'https://example.com' },
    }),
  ])('rejects malformed or unsupported responses %#', async (response) => {
    const transport = new ExternalTransport(
      policy,
      vi.fn<typeof fetch>().mockResolvedValue(response),
      () => 0,
    );
    await expect(
      transport.getJson(cpe, signal(), 10000),
    ).rejects.toBeInstanceOf(Error);
  });

  it('counts streamed bytes even when Content-Length is misleading', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('"áá"'));
      },
      cancel,
    });
    const response = new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json', 'content-length': '1' },
    });
    const transport = new ExternalTransport(
      { ...policy, nvdMaxResponseBytes: 5 },
      vi.fn<typeof fetch>().mockResolvedValue(response),
      () => 0,
    );
    await expect(transport.getJson(cpe, signal(), 10000)).rejects.toMatchObject(
      { kind: 'INVALID_RESPONSE' },
    );
    expect(cancel).toHaveBeenCalled();
  });

  it('rejects invalid UTF-8 rather than replacing bytes', async () => {
    const response = new Response(new Uint8Array([0x22, 0xc3, 0x22]), {
      headers: { 'content-type': 'application/json' },
    });
    const transport = new ExternalTransport(
      policy,
      vi.fn<typeof fetch>().mockResolvedValue(response),
      () => 0,
    );
    await expect(transport.getJson(cpe, signal(), 10000)).rejects.toMatchObject(
      { kind: 'INVALID_RESPONSE' },
    );
  });

  it('enforces the timeout even if a fetch implementation ignores abort', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() => new Promise(() => undefined));
    const transport = new ExternalTransport(
      { ...policy, requestTimeoutMs: 50 },
      fetcher,
      () => 0,
    );
    const pending = transport.getJson(cpe, signal(), 10000);
    const expected = expect(pending).rejects.toMatchObject({ kind: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(50);
    await expected;
  });

  it('propagates caller cancellation during body reading', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(new TextEncoder().encode('{'));
      },
      cancel,
    });
    const response = new Response(body, {
      headers: { 'content-type': 'application/json' },
    });
    const transport = new ExternalTransport(
      policy,
      vi.fn<typeof fetch>().mockResolvedValue(response),
      () => 0,
    );
    const pending = transport.getJson(cpe, controller.signal, 10000);
    const expected = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });
    await Promise.resolve();
    controller.abort();
    await expected;
    expect(cancel).toHaveBeenCalled();
  });

  it('includes body reading in the operation timeout', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(new TextEncoder().encode('{'));
      },
      cancel,
    });
    const response = new Response(body, {
      headers: { 'content-type': 'application/json' },
    });
    const transport = new ExternalTransport(
      { ...policy, requestTimeoutMs: 50 },
      vi.fn<typeof fetch>().mockResolvedValue(response),
      () => 0,
    );
    const pending = transport.getJson(cpe, signal(), 10000);
    const expected = expect(pending).rejects.toMatchObject({ kind: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(50);
    await expected;
    expect(cancel).toHaveBeenCalled();
  });

  it('does not swallow programming errors and respects the total deadline', async () => {
    const bug = new Error('programming error');
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(bug);
    const transport = new ExternalTransport(policy, fetcher, () => 10);
    await expect(transport.getJson(cpe, signal(), 20)).rejects.toBe(bug);
    await expect(transport.getJson(cpe, signal(), 10)).rejects.toMatchObject({
      kind: 'TIMEOUT',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('parses Retry-After without logging provider details', async () => {
    expect(parseRetryAfter('12', 0)).toBe(12000);
    expect(parseRetryAfter('not-a-date', 0)).toBeUndefined();
    expect(parseRetryAfter('1.5', 0)).toBeUndefined();
    expect(
      parseRetryAfter(
        'Wed, 21 Oct 2015 07:28:00 GMT',
        Date.parse('2015-10-21T07:27:59Z'),
      ),
    ).toBe(1000);
    const response = new Response('private', {
      status: 429,
      headers: { 'retry-after': '3' },
    });
    const transport = new ExternalTransport(
      policy,
      vi.fn<typeof fetch>().mockResolvedValue(response),
      () => 0,
    );
    await expect(transport.getJson(cpe, signal(), 10000)).rejects.toMatchObject(
      {
        kind: 'UNAVAILABLE',
        retryAfterMs: 3000,
        message: 'External source unavailable',
      },
    );
  });
});
