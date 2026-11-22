import { Pool } from 'pg';
import { PostgresUserCreator } from './postgres-user-creator.js';

describe('PostgresUserCreator', () => {
  let pool: Pool;
  let creator: PostgresUserCreator;

  const email = 'persona@example.com';
  const passwordHash = '$argon2id$test-only-hash';

  const row = {
    id: '6ba63463-9073-43d1-9b60-2fd868798cc0',
    email,
    created_at: new Date('2030-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    pool = new Pool();
    creator = new PostgresUserCreator(pool);
  });

  afterEach(async () => {
    await pool.end();
    vi.restoreAllMocks();
  });

  it('binds the values and returns only the public user fields', async () => {
    const query = vi.spyOn(pool, 'query').mockImplementationOnce(async () => ({
      rows: [{ ...row, password_hash: passwordHash }],
    }));

    await expect(creator.create(email, passwordHash)).resolves.toEqual({
      id: row.id,
      email: row.email,
      createdAt: row.created_at,
    });

    expect(query).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(
        'ON CONFLICT ON CONSTRAINT users_email_key DO NOTHING',
      ),
      [email, passwordHash],
    );

    expect(query.mock.calls[0][0]).not.toContain(passwordHash);
  });

  it('returns null when PostgreSQL skips a duplicate email', async () => {
    vi.spyOn(pool, 'query').mockImplementationOnce(async () => ({ rows: [] }));

    await expect(creator.create(email, passwordHash)).resolves.toBeNull();
  });

  it('propagates unexpected database failures', async () => {
    const error = new Error('Database unavailable');
    vi.spyOn(pool, 'query').mockRejectedValueOnce(error);

    await expect(creator.create(email, passwordHash)).rejects.toBe(error);
  });
});
