import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { randomBytes } from 'node:crypto';
import { authConfig } from '../../config/auth.config.js';
import { DatabaseModule } from '../../shared/database/database.module.js';
import { CREDENTIALS_READER } from './application/ports/credentials-reader.port.js';
import type { CredentialsReader } from './application/ports/credentials-reader.port.js';
import { SESSION_ISSUER } from './application/ports/session-issuer.port.js';
import type { SessionIssuer } from './application/ports/session-issuer.port.js';
import { LoginUser } from './application/login-user.js';
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
import { PostgresCredentialsReader } from './infrastructure/persistence/postgres-credentials-reader.js';
import { PostgresSessionIssuer } from './infrastructure/persistence/postgres-session-issuer.js';
import { SessionGuard } from './presentation/http/session.guard.js';
import { AuthController } from './presentation/http/auth.controller.js';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule.forFeature(authConfig),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 5 }],
    }),
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: LoginUser,
      inject: [CREDENTIALS_READER, PASSWORD_HASHER, SESSION_ISSUER],
      useFactory: async (
        credentials: CredentialsReader,
        passwords: PasswordHasher,
        sessions: SessionIssuer,
      ) =>
        new LoginUser(
          credentials,
          passwords,
          sessions,
          await passwords.hash(randomBytes(32).toString('base64url')),
        ),
    },
    { provide: SESSION_ISSUER, useClass: PostgresSessionIssuer },
    ThrottlerGuard,
    {
      provide: RegisterUser,
      inject: [USER_CREATOR, PASSWORD_HASHER],
      useFactory: (users: UserCreator, passwords: PasswordHasher) =>
        new RegisterUser(users, passwords),
    },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: USER_CREATOR, useClass: PostgresUserCreator },
    { provide: CREDENTIALS_READER, useClass: PostgresCredentialsReader },
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
