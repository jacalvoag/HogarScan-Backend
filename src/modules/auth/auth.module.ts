import { Module } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from '../../shared/database/database.module.js';
import { PASSWORD_HASHER } from './application/ports/password-hasher.port.js';
import type { PasswordHasher } from './application/ports/password-hasher.port.js';
import { USER_CREATOR } from './application/ports/user-creator.port.js';
import type { UserCreator } from './application/ports/user-creator.port.js';
import { RegisterUser } from './application/register-user.js';
import { SESSION_VERIFIER } from './application/ports/session-verifier.port.js';
import { VerifySession } from './application/verify-session.js';
import { Argon2PasswordHasher } from './infrastructure/crypto/argon2-password-hasher.js';
import { Sha256SessionTokenHasher } from './infrastructure/crypto/sha256-session-token-hasher.js';
import { PostgresSessionReader } from './infrastructure/persistence/postgres-session-reader.js';
import { PostgresUserCreator } from './infrastructure/persistence/postgres-user-creator.js';
import { SessionGuard } from './presentation/http/session.guard.js';
import { AuthController } from './presentation/http/auth.controller.js';

@Module({
  imports: [
    DatabaseModule,
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 5 }],
    }),
  ],
  controllers: [AuthController],
  providers: [
    ThrottlerGuard,
    {
      provide: RegisterUser,
      inject: [USER_CREATOR, PASSWORD_HASHER],
      useFactory: (users: UserCreator, passwords: PasswordHasher) =>
        new RegisterUser(users, passwords),
    },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: USER_CREATOR, useClass: PostgresUserCreator },
    PostgresSessionReader,
    Sha256SessionTokenHasher,
    {
      provide: SESSION_VERIFIER,
      inject: [PostgresSessionReader, Sha256SessionTokenHasher],
      useFactory: (
        sessions: PostgresSessionReader,
        hasher: Sha256SessionTokenHasher,
      ) => new VerifySession(sessions, hasher, () => new Date()),
    },
    SessionGuard,
  ],
  exports: [SessionGuard, SESSION_VERIFIER],
})
export class AuthModule {}
