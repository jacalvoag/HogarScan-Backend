import { VerifySession } from './verify-session.js';
import type {
  SessionReader,
  SessionRecord,
} from './ports/session-reader.port.js';
import { Sha256SessionTokenHasher } from '../infrastructure/crypto/sha256-session-token-hasher.js';

describe('VerifySession', () => {
  const token = 'A'.repeat(43);
  const hasher = new Sha256SessionTokenHasher();
  const findByTokenHash = vi.fn<SessionReader['findByTokenHash']>();
  const session: SessionRecord = {
    userId: '6ba63463-9073-43d1-9b60-2fd868798cc0',
    expiresAt: new Date('2030-01-02T00:00:00.000Z'),
    revokedAt: null,
  };

  let currentTime: Date;
  let verifier: VerifySession;

  beforeEach(() => {
    currentTime = new Date('2030-01-01T00:00:00.000Z');
    findByTokenHash.mockReset();
    findByTokenHash.mockResolvedValue(session);

    verifier = new VerifySession(
      { findByTokenHash },
      hasher,
      () => currentTime,
    );
  });

  it('uses the SHA-256 digest of the exact token text', () => {
    expect(hasher.hash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('queries by hash and returns only the authenticated identity', async () => {
    await expect(verifier.verify(token)).resolves.toEqual({
      userId: session.userId,
    });

    expect(findByTokenHash).toHaveBeenCalledExactlyOnceWith(hasher.hash(token));
    expect(findByTokenHash).not.toHaveBeenCalledWith(token);
  });

  it('rejects a session that does not exist', async () => {
    findByTokenHash.mockResolvedValueOnce(null);

    await expect(verifier.verify(token)).resolves.toBeNull();
  });

  it.each([
    new Date('2029-12-31T23:59:59.999Z'),
    new Date('2030-01-01T00:00:00.000Z'),
    new Date(Number.NaN),
  ])('rejects an expired or invalid expiration date: %s', async (expiresAt) => {
    findByTokenHash.mockResolvedValueOnce({ ...session, expiresAt });

    await expect(verifier.verify(token)).resolves.toBeNull();
  });

  it('rejects a revoked session even if it has not expired', async () => {
    findByTokenHash.mockResolvedValueOnce({
      ...session,
      revokedAt: currentTime,
    });

    await expect(verifier.verify(token)).resolves.toBeNull();
  });

  it('checks expiration after the session lookup completes', async () => {
    findByTokenHash.mockImplementationOnce(async () => {
      currentTime = session.expiresAt;
      return session;
    });

    await expect(verifier.verify(token)).resolves.toBeNull();
  });

  it('propagates storage failures instead of treating them as invalid sessions', async () => {
    findByTokenHash.mockRejectedValueOnce(new Error('Storage unavailable'));

    await expect(verifier.verify(token)).rejects.toThrow('Storage unavailable');
  });
});
