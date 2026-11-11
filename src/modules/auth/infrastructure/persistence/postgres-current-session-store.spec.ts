import { Pool } from 'pg';
import { PostgresCurrentSessionStore } from './postgres-current-session-store.js';

describe('PostgresCurrentSessionStore', () => {
  let pool: Pool;
  let store: PostgresCurrentSessionStore;

  const tokenHash = 'a'.repeat(64);
  const userId = '6ba63463-9073-43d1-9b60-2fd868798cc0';

  const row = {
    id: userId,
    email: 'persona@example.com',
    created_at: new Date('2030-01-01T00:00:00.000Z'),
    expires_at: new Date('2030-01-08T00:00:00.000Z'),
  };

  beforeEach(() => {
    pool = new Pool();
    store = new PostgresCurrentSessionStore(pool);
  });

  afterEach(async () => {
    await pool.end();
    vi.restoreAllMocks();
  });

  it.each([0, 7])(
    'returns public session data with generation %s',
    async (generation) => {
      const query = vi
        .spyOn(pool, 'query')
        .mockImplementationOnce(async () => ({
          rows: [{ ...row, summary_generation: generation }],
        }));

      await expect(store.findActive(tokenHash, userId)).resolves.toEqual({
        user: { id: userId, email: row.email, createdAt: row.created_at },
        expiresAt: row.expires_at,
        summaryGeneration: generation,
      });

      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining('WHERE s.token_hash = $1 AND s.user_id = $2'),
        [tokenHash, userId],
      );
    },
  );

  it('returns null when there is no active session for the token and user', async () => {
    vi.spyOn(pool, 'query').mockImplementationOnce(async () => ({ rows: [] }));

    await expect(store.findActive(tokenHash, userId)).resolves.toBeNull();
  });

  it.each([0, 1])(
    'reports revocation only when one row changes: %s',
    async (rowCount) => {
      const query = vi
        .spyOn(pool, 'query')
        .mockImplementationOnce(async () => ({ rowCount }));

      await expect(store.revokeActive(tokenHash, userId)).resolves.toBe(
        rowCount === 1,
      );

      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining('WHERE token_hash = $1 AND user_id = $2'),
        [tokenHash, userId],
      );
    },
  );

  it.each(['findActive', 'revokeActive'] as const)(
    'propagates database failures from %s',
    async (operation) => {
      const error = new Error('Database unavailable');
      vi.spyOn(pool, 'query').mockRejectedValueOnce(error);

      await expect(store[operation](tokenHash, userId)).rejects.toBe(error);
    },
  );
});
