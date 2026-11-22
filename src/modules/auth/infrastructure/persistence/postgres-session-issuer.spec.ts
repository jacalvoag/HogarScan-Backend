import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { Sha256SessionTokenHasher } from '../crypto/sha256-session-token-hasher.js';
import { PostgresSessionIssuer } from './postgres-session-issuer.js';

describe('PostgresSessionIssuer', () => {
  let pool: Pool;
  let issuer: PostgresSessionIssuer;

  const userId = '6ba63463-9073-43d1-9b60-2fd868798cc0';
  const expiresAt = new Date('2030-01-08T00:00:00.000Z');

  beforeEach(() => {
    pool = new Pool();
    issuer = new PostgresSessionIssuer(pool, new Sha256SessionTokenHasher(), {
      sessionTtlSeconds: 604_800,
    });
  });

  afterEach(async () => {
    await pool.end();
    vi.restoreAllMocks();
  });

  it('stores only the hash and returns the database expiration', async () => {
    const query = vi.spyOn(pool, 'query').mockImplementationOnce(async () => ({
      rows: [{ expires_at: expiresAt }],
    }));

    const session = await issuer.issue(userId);

    expect(session.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(session.accessToken, 'base64url')).toHaveLength(32);
    expect(session.expiresAt).toEqual(expiresAt);

    const tokenHash = createHash('sha256')
      .update(session.accessToken)
      .digest('hex');

    expect(query).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('CURRENT_TIMESTAMP'),
      [tokenHash, userId, 604_800],
    );
  });

  it('creates a different token for each session', async () => {
    vi.spyOn(pool, 'query').mockImplementation(async () => ({
      rows: [{ expires_at: expiresAt }],
    }));

    const first = await issuer.issue(userId);
    const second = await issuer.issue(userId);

    expect(second.accessToken).not.toBe(first.accessToken);
  });

  it('does not return a token when persistence fails', async () => {
    const error = new Error('Database unavailable');
    vi.spyOn(pool, 'query').mockRejectedValueOnce(error);

    await expect(issuer.issue(userId)).rejects.toBe(error);
  });

  it('fails if the insertion returns no expiration', async () => {
    vi.spyOn(pool, 'query').mockImplementationOnce(async () => ({ rows: [] }));

    await expect(issuer.issue(userId)).rejects.toThrow(
      'Session insert returned no expiration.',
    );
  });
});
