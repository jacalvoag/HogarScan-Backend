import type { User } from '../../domain/user.js';

export const USER_CREATOR = Symbol('USER_CREATOR');

export interface UserCreator {
  // Returns null when the email is already registered.
  create(email: string, passwordHash: string): Promise<User | null>;
}
