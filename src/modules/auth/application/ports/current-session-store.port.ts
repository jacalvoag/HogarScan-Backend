import type { User } from '../../domain/user.js';

export const CURRENT_SESSION_STORE = Symbol('CURRENT_SESSION_STORE');

export interface CurrentSession {
  readonly user: User;
  readonly expiresAt: Date;
  readonly summaryGeneration: number;
}

export interface CurrentSessionStore {
  findActive(tokenHash: string, userId: string): Promise<CurrentSession | null>;
  revokeActive(tokenHash: string, userId: string): Promise<boolean>;
}
