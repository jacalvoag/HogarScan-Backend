import { validateEnvironment } from './environment.js';

describe('validateEnvironment', () => {
  it('uses defaults when the application variables are absent', () => {
    expect(validateEnvironment({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
    });
  });

  it('converts a configured port into a number', () => {
    expect(
      validateEnvironment({ NODE_ENV: 'production', PORT: '8080' }),
    ).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
    });
  });

  it.each(['development', 'test', 'production'])(
    'accepts NODE_ENV=%s',
    (nodeEnv) => {
      expect(validateEnvironment({ NODE_ENV: nodeEnv }).NODE_ENV).toBe(nodeEnv);
    },
  );

  it.each(['', 'staging', 'Production', null])(
    'rejects unsupported NODE_ENV=%j',
    (nodeEnv) => {
      expect(() => validateEnvironment({ NODE_ENV: nodeEnv })).toThrow(
        'NODE_ENV debe ser development, test o production.',
      );
    },
  );

  it.each(['1', '65535'])('accepts the port boundary %s', (port) => {
    expect(validateEnvironment({ PORT: port }).PORT).toBe(Number(port));
  });

  it.each(['', '0', '65536', '-1', '3.5', '1e3', ' 3000 ', 'abc', null, 3000])(
    'rejects invalid PORT=%j',
    (port) => {
      expect(() => validateEnvironment({ PORT: port })).toThrow(
        'PORT debe ser un entero entre 1 y 65535.',
      );
    },
  );

  it('preserves variables needed by other configuration factories', () => {
    expect(validateEnvironment({ PORT: '3000', DB_PORT: '5432' })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DB_PORT: '5432',
    });
  });
});
