import type { PasswordHasher } from './ports/password-hasher.port.js';
import type { UserCreator } from './ports/user-creator.port.js';
import type { User } from '../domain/user.js';

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super('Email already registered');
    this.name = 'EmailAlreadyRegisteredError';
  }
}

export class RegisterUser {
  constructor(
    private readonly users: UserCreator,
    private readonly passwords: PasswordHasher,
  ) {}

  async execute(email: string, password: string): Promise<User> {
    const passwordHash = await this.passwords.hash(password);
    const user = await this.users.create(email.toLowerCase(), passwordHash);

    if (user === null) throw new EmailAlreadyRegisteredError();

    return user;
  }
}
