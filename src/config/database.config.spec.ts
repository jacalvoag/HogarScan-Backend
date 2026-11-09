import { validateDatabaseEnvironment } from './database.config.js';

describe('validateDatabaseEnvironment', () => {
  const values = {
    DB_HOST: 'example.mx-central-1.rds.amazonaws.com',
    DB_NAME: 'hogarscan',
    DB_USER: 'hogarscan_api',
    DB_PASSWORD: ' test-only password ',
    DB_SSL_CA_PATH: 'C:/test certificates/mx-central-1-bundle.pem',
  };

  it('validates configuration and preserves the exact password and CA path', () => {
    expect(validateDatabaseEnvironment(values)).toEqual({
      host: values.DB_HOST,
      port: 5432,
      database: values.DB_NAME,
      user: values.DB_USER,
      password: values.DB_PASSWORD,
      caPath: values.DB_SSL_CA_PATH,
    });
  });

  it.each(['1', '5432', '65535'])('accepts DB_PORT=%s', (port) => {
    expect(validateDatabaseEnvironment({ ...values, DB_PORT: port }).port).toBe(
      Number(port),
    );
  });

  it.each(['', '0', '65536', '-1', '5.5', '1e3', ' 5432 ', null, 5432])(
    'rejects invalid DB_PORT=%j',
    (port) => {
      expect(() =>
        validateDatabaseEnvironment({ ...values, DB_PORT: port }),
      ).toThrow('DB_PORT');
    },
  );

  it.each(['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_SSL_CA_PATH'])(
    'requires %s',
    (field) => {
      expect(() =>
        validateDatabaseEnvironment({ ...values, [field]: undefined }),
      ).toThrow(field);

      expect(() =>
        validateDatabaseEnvironment({ ...values, [field]: '' }),
      ).toThrow(field);
    },
  );

  it('ignores environment variables belonging to other configurations', () => {
    expect(
      validateDatabaseEnvironment({ ...values, NODE_ENV: 'test' }),
    ).toEqual(validateDatabaseEnvironment(values));
  });

  it('reports invalid field names without exposing the password', () => {
    let message = '';

    try {
      validateDatabaseEnvironment({ ...values, DB_PORT: 'invalid' });
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      message = error.message;
    }

    expect(message).toContain('DB_PORT');
    expect(message).not.toContain(values.DB_PASSWORD);
  });
});
