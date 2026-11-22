import { validateAuthEnvironment } from './auth.config.js';

describe('Authentication configuration', () => {
  it('defaults to seven days', () => {
    expect(validateAuthEnvironment({})).toEqual({
      sessionTtlSeconds: 604_800,
    });
  });

  it.each(['1', '3600', '2592000'])(
    'accepts SESSION_TTL_SECONDS=%s',
    (value) => {
      expect(validateAuthEnvironment({ SESSION_TTL_SECONDS: value })).toEqual({
        sessionTtlSeconds: Number(value),
      });
    },
  );

  it.each(['', '0', '2592001', '1e3', '1.5', ' 3600 ', null, 3600])(
    'rejects invalid SESSION_TTL_SECONDS=%j',
    (value) => {
      expect(() =>
        validateAuthEnvironment({ SESSION_TTL_SECONDS: value }),
      ).toThrow('SESSION_TTL_SECONDS');
    },
  );
});
