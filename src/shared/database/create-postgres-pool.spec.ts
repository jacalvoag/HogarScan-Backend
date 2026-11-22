import { Logger } from '@nestjs/common';
import { Pool } from 'pg';
import type { DatabaseConfig } from '../../config/database.config.js';
import { createPostgresPool } from './create-postgres-pool.js';

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({ readFile: mocks.readFile }));

vi.mock('pg', () => ({
  Pool: vi.fn(function () {
    return { query: mocks.query, end: mocks.end, on: mocks.on };
  }),
}));

describe('createPostgresPool', () => {
  const config: DatabaseConfig = {
    host: 'example.mx-central-1.rds.amazonaws.com',
    port: 5432,
    database: 'hogarscan',
    user: 'hogarscan_api',
    password: 'test-only-password',
    caPath: '/test/mx-central-1-bundle.pem',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readFile.mockResolvedValue('test-only-ca');
    mocks.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    mocks.end.mockResolvedValue(undefined);
  });

  it('requires certificate verification and checks the connection', async () => {
    const pool = await createPostgresPool(config);

    expect(mocks.readFile).toHaveBeenCalledWith(config.caPath, 'utf8');

    expect(Pool).toHaveBeenCalledWith({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      application_name: 'hogarscan-api',
      max: 3,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 10_000,
      ssl: {
        ca: 'test-only-ca',
        rejectUnauthorized: true,
        servername: config.host,
        minVersion: 'TLSv1.2',
      },
    });

    expect(mocks.query).toHaveBeenCalledWith('SELECT 1');
    expect(pool).toEqual(expect.objectContaining({ query: mocks.query }));
    expect(mocks.end).not.toHaveBeenCalled();
  });

  it('does not create a pool when the CA file cannot be read', async () => {
    const error = new Error('CA unavailable');
    mocks.readFile.mockRejectedValueOnce(error);

    await expect(createPostgresPool(config)).rejects.toBe(error);
    expect(Pool).not.toHaveBeenCalled();
  });

  it('closes the pool when the initial connection fails', async () => {
    const error = new Error('Connection failed');
    mocks.query.mockRejectedValueOnce(error);

    await expect(createPostgresPool(config)).rejects.toBe(error);
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it('handles idle connection errors without logging their contents', async () => {
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    try {
      await createPostgresPool(config);

      expect(mocks.on).toHaveBeenCalledWith('error', expect.any(Function));

      const handler = mocks.on.mock.calls[0][1] as (error: Error) => void;
      handler(new Error('Sensitive connection details'));

      expect(log).toHaveBeenCalledExactlyOnceWith(
        'Se perdió una conexión inactiva con PostgreSQL.',
      );
    } finally {
      log.mockRestore();
    }
  });
});
