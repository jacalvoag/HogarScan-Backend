import {
  ExternalSourceError,
  InvalidExternalPayloadError,
} from '../../application/ports/external-source-result.js';
import { ExternalJsonCache } from './external-json-cache.js';
import { ExternalJsonGateway } from './external-json-gateway.js';
import { ExternalScheduler } from './external-scheduler.js';
import type {
  ExternalRequest,
  ExternalTransport,
} from './external-transport.js';

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
  const make = (enabled = true) => {
    const now = () => time;
    const cache = new ExternalJsonCache(
      {
        enabled: true,
        cacheTtlSeconds: 1,
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
    const gateway = new ExternalJsonGateway(
      enabled,
      cache,
      scheduler,
      { getJson },
      now,
      () => date,
    );
    return { cache, gateway, getJson };
  };
  beforeEach(() => {
    time = 0;
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

  it('does not cache a result obtained after the evaluation deadline', async () => {
    const { gateway, getJson, cache } = make();
    getJson.mockImplementationOnce(async () => {
      time = 10;
      return { valid: true };
    });
    await expect(
      gateway.get({ kind: 'KEV' }, parse, signal(), 10),
    ).rejects.toBeInstanceOf(ExternalSourceError);
    expect(cache.get('["KEV"]')).toBeUndefined();
  });
});
