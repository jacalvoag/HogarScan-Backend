import { Pool } from 'pg';
import { PostgresSessionReader } from './postgres-session-reader.js';

describe('PostgresSessionReader', () => {
  let pool: Pool;
  let reader: PostgresSessionReader;

  const tokenHash = 'a'.repeat(64);
  const row = {
    user_id: '6ba63463-9073-43d1-9b60-2fd868798cc0',
    expires_at: new Date('2030-01-02T00:00:00.000Z'),
    revoked_at: null,
  };

  beforeEach(() => {
    pool = new Pool();
    reader = new PostgresSessionReader(pool);
  });

  afterEach(async () => {
    await pool.end();
    vi.restoreAllMocks();
  });

  it.each([null, new Date('2030-01-01T12:00:00.000Z')])(
    'maps a stored session with revoked_at=%s',
    async (revokedAt) => {
      vi.spyOn(pool, 'query').mockImplementationOnce(async () => ({
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
        rows: [{ ...row, revoked_at: revokedAt }],
      }));

      await expect(reader.findByTokenHash(tokenHash)).resolves.toEqual({
        userId: row.user_id,
        expiresAt: row.expires_at,
        revokedAt,
      });
    },
  );

  it('returns null when no session matches the hash', async () => {
    vi.spyOn(pool, 'query').mockImplementationOnce(async () => ({
      command: 'SELECT',
      rowCount: 0,
      oid: 0,
      fields: [],
      rows: [],
    }));

    await expect(reader.findByTokenHash(tokenHash)).resolves.toBeNull();
  });

  it('passes input as a bound parameter rather than SQL text', async () => {
    const input = "' OR true --";

    const query = vi.spyOn(pool, 'query').mockImplementationOnce(async () => ({
      command: 'SELECT',
      rowCount: 0,
      oid: 0,
      fields: [],
      rows: [],
    }));

    await reader.findByTokenHash(input);

    expect(query).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('WHERE token_hash = $1'),
      [input],
    );

    expect(query.mock.calls[0][0]).not.toContain(input);
  });

  it('propagates a database failure instead of reporting a missing session', async () => {
    const error = new Error('Database unavailable');
    vi.spyOn(pool, 'query').mockRejectedValueOnce(error);

    await expect(reader.findByTokenHash(tokenHash)).rejects.toBe(error);
  });
});
