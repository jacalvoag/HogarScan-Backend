import { validateEnvironment } from './environment.js';

describe('validateEnvironment', () => {
  it('uses defaults when the application variables are absent', () => {
    expect(validateEnvironment({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      API_HOST: '0.0.0.0',
      TRUST_LOCAL_PROXY: false,
    });
  });

  it('converts a configured port into a number', () => {
    expect(
      validateEnvironment({ NODE_ENV: 'production', PORT: '8080' }),
    ).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
      API_HOST: '0.0.0.0',
      TRUST_LOCAL_PROXY: false,
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

  it.each([
    '',
    '0',
    '65536',
    '-1',
    '3.5',
    '1e3',
    ' 3000 ',
    '3000\n',
    'abc',
    null,
    3000,
  ])('rejects invalid PORT=%j', (port) => {
    expect(() => validateEnvironment({ PORT: port })).toThrow(
      'PORT debe ser un entero entre 1 y 65535.',
    );
  });

  it('preserves variables needed by other configuration factories', () => {
    expect(validateEnvironment({ PORT: '3000', DB_PORT: '5432' })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      API_HOST: '0.0.0.0',
      DB_PORT: '5432',
      TRUST_LOCAL_PROXY: false,
    });
  });

  it.each(['127.0.0.1', '0.0.0.0', '::1', '::'])(
    'accepts an explicit listening address: %s',
    (host) => {
      expect(validateEnvironment({ API_HOST: host }).API_HOST).toBe(host);
    },
  );

  it.each([
    '',
    'localhost',
    '256.0.0.1',
    ' 127.0.0.1 ',
    '127.0.0.1\n',
    null,
    3000,
  ])('rejects an invalid listening address: %j', (host) => {
    expect(() => validateEnvironment({ API_HOST: host })).toThrow(
      'API_HOST debe ser una dirección IPv4 o IPv6 literal.',
    );
  });

  it.each(['true', 'false'])('accepts TRUST_LOCAL_PROXY=%s', (value) => {
    expect(
      validateEnvironment({ TRUST_LOCAL_PROXY: value }).TRUST_LOCAL_PROXY,
    ).toBe(value === 'true');
  });

  it.each(['', 'TRUE', '1', 'true\n', ' false ', true, false, null])(
    'rejects invalid TRUST_LOCAL_PROXY=%j',
    (value) => {
      expect(() => validateEnvironment({ TRUST_LOCAL_PROXY: value })).toThrow(
        'TRUST_LOCAL_PROXY debe ser true o false.',
      );
    },
  );
});
