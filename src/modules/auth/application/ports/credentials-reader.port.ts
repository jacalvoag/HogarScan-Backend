import type { User } from '../../domain/user.js';

export const CREDENTIALS_READER = Symbol('CREDENTIALS_READER');

export interface UserCredentials {
  readonly user: User;
  readonly passwordHash: string;
  readonly summaryGeneration: number;
}

export interface CredentialsReader {
  findByEmail(normalizedEmail: string): Promise<UserCredentials | null>;
}
