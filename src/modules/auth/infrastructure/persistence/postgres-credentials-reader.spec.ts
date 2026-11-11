import { Pool } from 'pg';
import { PostgresCredentialsReader } from './postgres-credentials-reader.js';

describe('PostgresCredentialsReader', () => {
  let pool: Pool;
  let reader: PostgresCredentialsReader;

  const row = {
    id: '6ba63463-9073-43d1-9b60-2fd868798cc0',
    email: "o'hara@example.com",
    password_hash: '$argon2id$test-only-hash',
    created_at: new Date('2030-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    pool = new Pool();
    reader = new PostgresCredentialsReader(pool);
  });

  afterEach(async () => {
    await pool.end();
    vi.restoreAllMocks();
  });

  it.each([0, 7])(
    'reads private credentials with summary generation %s',
    async (generation) => {
      const query = vi
        .spyOn(pool, 'query')
        .mockImplementationOnce(async () => ({
          rows: [{ ...row, summary_generation: generation }],
        }));

      await expect(reader.findByEmail(row.email)).resolves.toEqual({
        user: {
          id: row.id,
          email: row.email,
          createdAt: row.created_at,
        },
        passwordHash: row.password_hash,
        summaryGeneration: generation,
      });

      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining('WHERE email = $1'),
        [row.email],
      );

      expect(query.mock.calls[0][0]).not.toContain(row.email);
    },
  );

  it('returns null when the email has no account', async () => {
    vi.spyOn(pool, 'query').mockImplementationOnce(async () => ({ rows: [] }));

    await expect(reader.findByEmail(row.email)).resolves.toBeNull();
  });

  it('propagates database failures instead of reporting a missing account', async () => {
    const error = new Error('Database unavailable');
    vi.spyOn(pool, 'query').mockRejectedValueOnce(error);

    await expect(reader.findByEmail(row.email)).rejects.toBe(error);
  });
});
