import type { CurrentSessionStore } from './ports/current-session-store.port.js';
import type { SessionTokenHasher } from './ports/session-token-hasher.port.js';

export class InvalidSessionError extends Error {}

export class ManageCurrentSession {
  constructor(
    private readonly sessions: CurrentSessionStore,
    private readonly hasher: SessionTokenHasher,
  ) {}

  async get(userId: string, token: string) {
    const session = await this.sessions.findActive(
      this.hasher.hash(token),
      userId,
    );

    if (session === null) throw new InvalidSessionError();
    return session;
  }

  async revoke(userId: string, token: string): Promise<void> {
    const revoked = await this.sessions.revokeActive(
      this.hasher.hash(token),
      userId,
    );

    if (!revoked) throw new InvalidSessionError();
  }
}
