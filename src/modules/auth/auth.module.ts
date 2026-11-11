import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module.js';
import { SESSION_VERIFIER } from './application/ports/session-verifier.port.js';
import { VerifySession } from './application/verify-session.js';
import { Sha256SessionTokenHasher } from './infrastructure/crypto/sha256-session-token-hasher.js';
import { PostgresSessionReader } from './infrastructure/persistence/postgres-session-reader.js';
import { SessionGuard } from './presentation/http/session.guard.js';
import { PASSWORD_HASHER } from './application/ports/password-hasher.port.js';
import { Argon2PasswordHasher } from './infrastructure/crypto/argon2-password-hasher.js';
import { USER_CREATOR } from './application/ports/user-creator.port.js';
import { PostgresUserCreator } from './infrastructure/persistence/postgres-user-creator.js';

@Module({
  imports: [DatabaseModule],
  providers: [
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
