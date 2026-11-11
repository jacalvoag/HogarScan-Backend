import type { User } from '../domain/user.js';
import type { CredentialsReader } from './ports/credentials-reader.port.js';
import type { PasswordHasher } from './ports/password-hasher.port.js';
import type {
  IssuedSession,
  SessionIssuer,
} from './ports/session-issuer.port.js';

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid credentials');
    this.name = 'InvalidCredentialsError';
  }
}

export interface LoginResult extends IssuedSession {
  readonly user: User;
  readonly summaryGeneration: number;
}

export class LoginUser {
  constructor(
    private readonly credentials: CredentialsReader,
    private readonly passwords: PasswordHasher,
    private readonly sessions: SessionIssuer,
    private readonly dummyPasswordHash: string,
  ) {}

  async execute(email: string, password: string): Promise<LoginResult> {
    const credentials = await this.credentials.findByEmail(email.toLowerCase());

    const valid = await this.passwords.verify(
      password,
      credentials?.passwordHash ?? this.dummyPasswordHash,
    );

    if (credentials === null || !valid) {
      throw new InvalidCredentialsError();
    }

    const session = await this.sessions.issue(credentials.user.id);

    return {
      user: credentials.user,
      ...session,
      summaryGeneration: credentials.summaryGeneration,
    };
  }
}
