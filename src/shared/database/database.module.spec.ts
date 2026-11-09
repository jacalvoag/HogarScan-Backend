import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { databaseConfig } from '../../config/database.config.js';
import type { DatabaseConfig } from '../../config/database.config.js';
import { createPostgresPool } from './create-postgres-pool.js';
import { DatabaseModule } from './database.module.js';
import { POSTGRES_POOL } from './postgres-pool.token.js';

vi.mock('./create-postgres-pool.js', () => ({
  createPostgresPool: vi.fn(),
}));

describe('DatabaseModule', () => {
  const config: DatabaseConfig = {
    host: 'example.mx-central-1.rds.amazonaws.com',
    port: 5432,
    database: 'hogarscan',
    user: 'hogarscan_api',
    password: 'test-only-password',
    caPath: '/test/mx-central-1-bundle.pem',
  };

  beforeEach(() => {
    vi.mocked(createPostgresPool).mockReset();
  });

  it('provides the verified pool and closes it on application shutdown', async () => {
    const pool = new Pool();
    const end = vi.spyOn(pool, 'end');

    vi.mocked(createPostgresPool).mockResolvedValueOnce(pool);

    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
    })
      .overrideProvider(databaseConfig.KEY)
      .useValue(config)
      .compile();

    try {
      await moduleRef.init();

      expect(createPostgresPool).toHaveBeenCalledExactlyOnceWith(config);
      expect(moduleRef.get<Pool>(POSTGRES_POOL)).toBe(pool);
      expect(end).not.toHaveBeenCalled();
    } finally {
      await moduleRef.close();
    }

    expect(end).toHaveBeenCalledOnce();
  });

  it('rejects module creation when the initial connection fails', async () => {
    const error = new Error('Connection failed');

    vi.mocked(createPostgresPool).mockRejectedValueOnce(error);

    await expect(
      Test.createTestingModule({ imports: [DatabaseModule] })
        .overrideProvider(databaseConfig.KEY)
        .useValue(config)
        .compile(),
    ).rejects.toBe(error);
  });
});
