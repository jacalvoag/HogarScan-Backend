import { ExternalJsonCache, externalCacheKey } from './external-json-cache.js';

describe('External JSON cache', () => {
  let time = 0;
  const date = new Date('2026-11-14T00:00:00Z');
  const signal = () => new AbortController().signal;
  const policy = {
    enabled: true,
    cacheTtlSeconds: 1,
    cacheMaxEntries: 2,
    cacheMaxBytes: 1000,
  };
  beforeEach(() => {
    time = 0;
  });

  it('isolates keys by provider, effective query, offset and page size', () => {
    const base = {
      kind: 'NVD_CPE',
      matchString: 'cpe:2.3:*:example:router_x:1A',
      startIndex: 0,
      pageSize: 50,
    } as const;
    expect(externalCacheKey(base)).not.toBe(
      externalCacheKey({ ...base, startIndex: 50 }),
    );
    expect(externalCacheKey(base)).not.toBe(
      externalCacheKey({ ...base, pageSize: 10 }),
    );
    expect(externalCacheKey(base)).not.toBe(
      externalCacheKey({
        ...base,
        matchString: 'cpe:2.3:*:example:router_x:1a',
      }),
    );
    expect(externalCacheKey(base)).not.toBe(
      externalCacheKey({
        kind: 'NVD_CVE',
        cpeName: 'Router X',
        startIndex: 0,
        pageSize: 50,
      }),
    );
  });

  it('preserves acquisition time, returns independent copies and never extends TTL on reads', () => {
    const cache = new ExternalJsonCache(policy, () => time);
    const input = { nested: { text: 'original' } };
    expect(cache.put('key', input, date, 0, signal(), 5000)).toBe(true);
    input.nested.text = 'changed';
    time = 900;
    const first = cache.get('key');
    expect(first).toEqual({
      value: { nested: { text: 'original' } },
      obtainedAt: date,
    });
    first?.obtainedAt.setUTCFullYear(2000);
    expect(cache.get('key')?.obtainedAt).toEqual(date);
    time = 1000;
    expect(cache.get('key')).toBeUndefined();
  });

  it('evicts least recently used entries when the entry limit is reached', () => {
    const cache = new ExternalJsonCache(policy, () => time);
    cache.put('a', { n: 1 }, date, 0, signal(), 5000);
    cache.put('b', { n: 2 }, date, 0, signal(), 5000);
    cache.get('a');
    cache.put('c', { n: 3 }, date, 0, signal(), 5000);
    expect(cache.get('a')).toBeDefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBeDefined();
  });

  it('enforces UTF-8 bytes for both key and JSON body and keeps existing data on oversized writes', () => {
    const cache = new ExternalJsonCache(
      { ...policy, cacheMaxBytes: 12 },
      () => time,
    );
    expect(cache.put('á', 'á', date, 0, signal(), 5000)).toBe(true);
    expect(
      cache.put('b', 'longer than the limit', date, 0, signal(), 5000),
    ).toBe(false);
    expect(cache.get('á')?.value).toBe('á');
    expect(cache.put('c', 'éééé', date, 0, signal(), 5000)).toBe(true);
    expect(cache.get('á')).toBeUndefined();
  });

  it('combina límites de entradas y bytes con el vencimiento original', () => {
    const cache = new ExternalJsonCache(
      { ...policy, cacheMaxBytes: 12 },
      () => time,
    );
    const store = (key: string, value: string) =>
      cache.put(
        key,
        value,
        new Date(date.getTime() + time),
        time,
        signal(),
        5000,
      );
    store('a', '1');
    store('b', '2');
    store('c', '3');
    expect(cache.get('a')).toBeUndefined(); // Three entries would fit in bytes.
    expect(cache.get('b')).toBeDefined();
    time = 500;
    store('d', 'éééé');
    // The large entry fits alone but neither small entry fits alongside it.
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBeUndefined();
    time = 1499;
    expect(cache.get('d')?.obtainedAt.getTime()).toBe(date.getTime() + 500);
    time = 1500;
    expect(cache.get('d')).toBeUndefined();
  });

  it('never reads or writes when disabled, cancelled or past deadline', () => {
    const cache = new ExternalJsonCache(
      { ...policy, enabled: false },
      () => time,
    );
    expect(cache.put('a', {}, date, 0, signal(), 5000)).toBe(false);
    expect(cache.get('a')).toBeUndefined();
    const enabled = new ExternalJsonCache(policy, () => time);
    const controller = new AbortController();
    controller.abort();
    expect(enabled.put('a', {}, date, 0, controller.signal, 5000)).toBe(false);
    expect(enabled.put('a', {}, date, 0, signal(), 0)).toBe(false);
    expect(enabled.get('a')).toBeUndefined();
  });

  it('does not accept invalid acquisition times or non-JSON values', () => {
    const cache = new ExternalJsonCache(policy, () => time);
    expect(() => cache.put('x', {}, new Date(NaN), 0, signal(), 100)).toThrow(
      'Invalid cache acquisition time',
    );
    expect(() => cache.put('x', undefined, date, 0, signal(), 100)).toThrow(
      'Cache value is not JSON',
    );
  });
});
