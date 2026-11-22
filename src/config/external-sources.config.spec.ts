import { validateExternalSourcesEnvironment } from './external-sources.config.js';

describe('External sources configuration', () => {
  it('disables sources by default and supplies bounded pilot settings', () => {
    expect(validateExternalSourcesEnvironment({})).toEqual({
      enabled: false,
      requestTimeoutMs: 10_000,
      evaluationBudgetMs: 45_000,
      maxConcurrentRequests: 1,
      maxQueuedRequests: 8,
      nvdMinIntervalMs: 10_000,
      nvdMaxResponseBytes: 2_097_152,
      nvdPageSize: 50,
      nvdMaxPages: 2,
      kevMaxResponseBytes: 5_242_880,
      cacheTtlSeconds: 3_600,
      cacheMaxEntries: 50,
      cacheMaxBytes: 8_388_608,
      nvdApiKey: undefined,
    });
  });

  it('maps explicitly configured values without treating false as true', () => {
    expect(
      validateExternalSourcesEnvironment({
        EXTERNAL_SOURCES_ENABLED: 'false',
        EXTERNAL_REQUEST_TIMEOUT_MS: '2000',
        EXTERNAL_EVALUATION_BUDGET_MS: '2000',
        EXTERNAL_MAX_CONCURRENT_REQUESTS: '2',
        EXTERNAL_MAX_QUEUED_REQUESTS: '0',
        NVD_MIN_INTERVAL_MS: '15000',
        NVD_MAX_RESPONSE_BYTES: '65536',
        NVD_PAGE_SIZE: '10',
        NVD_MAX_PAGES: '1',
        KEV_MAX_RESPONSE_BYTES: '65536',
        EXTERNAL_CACHE_TTL_SECONDS: '600',
        EXTERNAL_CACHE_MAX_ENTRIES: '5',
        EXTERNAL_CACHE_MAX_BYTES: '1048576',
        NVD_API_KEY: 'synthetic-key-for-tests',
      }),
    ).toEqual({
      enabled: false,
      requestTimeoutMs: 2_000,
      evaluationBudgetMs: 2_000,
      maxConcurrentRequests: 2,
      maxQueuedRequests: 0,
      nvdMinIntervalMs: 15_000,
      nvdMaxResponseBytes: 65_536,
      nvdPageSize: 10,
      nvdMaxPages: 1,
      kevMaxResponseBytes: 65_536,
      cacheTtlSeconds: 600,
      cacheMaxEntries: 5,
      cacheMaxBytes: 1_048_576,
      nvdApiKey: 'synthetic-key-for-tests',
    });
  });

  it('accepts an explicit enable flag without requiring a key', () => {
    expect(
      validateExternalSourcesEnvironment({ EXTERNAL_SOURCES_ENABLED: 'true' })
        .enabled,
    ).toBe(true);
  });

  it.each(['TRUE', '1', '', true, null])(
    'rejects an ambiguous enable flag: %j',
    (value) => {
      expect(() =>
        validateExternalSourcesEnvironment({ EXTERNAL_SOURCES_ENABLED: value }),
      ).toThrow('EXTERNAL_SOURCES_ENABLED');
    },
  );

  it.each(['', '1e1', '1.5', '-1', ' 10', '10 ', '10\n', 10, null])(
    'rejects malformed integer settings: %j',
    (value) => {
      expect(() =>
        validateExternalSourcesEnvironment({ NVD_PAGE_SIZE: value }),
      ).toThrow('NVD_PAGE_SIZE');
    },
  );

  it.each([
    ['EXTERNAL_REQUEST_TIMEOUT_MS', '30001'],
    ['EXTERNAL_MAX_CONCURRENT_REQUESTS', '3'],
    ['EXTERNAL_MAX_QUEUED_REQUESTS', '33'],
    ['NVD_MIN_INTERVAL_MS', '9999'],
    ['NVD_PAGE_SIZE', '101'],
    ['NVD_MAX_PAGES', '0'],
    ['NVD_MAX_RESPONSE_BYTES', '5242881'],
    ['KEV_MAX_RESPONSE_BYTES', '10485761'],
    ['EXTERNAL_CACHE_TTL_SECONDS', '0'],
    ['EXTERNAL_CACHE_MAX_ENTRIES', '201'],
    ['EXTERNAL_CACHE_MAX_BYTES', '33554433'],
  ])('rejects a setting outside the pilot limits: %s', (key, value) => {
    expect(() => validateExternalSourcesEnvironment({ [key]: value })).toThrow(
      key,
    );
  });

  it('rejects a total budget shorter than a single request timeout', () => {
    expect(() =>
      validateExternalSourcesEnvironment({
        EXTERNAL_EVALUATION_BUDGET_MS: '9999',
      }),
    ).toThrow('EXTERNAL_EVALUATION_BUDGET_MS');
  });

  it('rejects a cache budget smaller than one permitted response', () => {
    expect(() =>
      validateExternalSourcesEnvironment({
        EXTERNAL_CACHE_MAX_BYTES: '1048576',
      }),
    ).toThrow('EXTERNAL_CACHE_MAX_BYTES');
  });

  it('treats an empty optional key as absent', () => {
    expect(
      validateExternalSourcesEnvironment({ NVD_API_KEY: '' }).nvdApiKey,
    ).toBeUndefined();
  });

  it.each([' ', 'key\n', 'key\r\nInjected: value', 'x'.repeat(257), 123])(
    'rejects invalid credentials without exposing their value: %j',
    (value) => {
      expect(() =>
        validateExternalSourcesEnvironment({ NVD_API_KEY: value }),
      ).toThrow(/^Configuración de fuentes externas inválida: NVD_API_KEY\.$/);
    },
  );
});
