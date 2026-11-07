import type { AuthenticatedIdentity } from '../domain/authenticated-identity.js';
import type { SessionReader } from './ports/session-reader.port.js';
import type { SessionTokenHasher } from './ports/session-token-hasher.port.js';
import type { SessionVerifier } from './ports/session-verifier.port.js';

export class VerifySession implements SessionVerifier {
  constructor(
    private readonly sessions: SessionReader,
    private readonly tokenHasher: SessionTokenHasher,
    private readonly now: () => Date,
  ) {}

  async verify(token: string): Promise<AuthenticatedIdentity | null> {
    const tokenHash = this.tokenHasher.hash(token);
    const session = await this.sessions.findByTokenHash(tokenHash);

    if (
      session === null ||
      session.revokedAt !== null ||
      !(session.expiresAt.getTime() > this.now().getTime())
    ) {
      return null;
    }

    return { userId: session.userId };
  }
}
