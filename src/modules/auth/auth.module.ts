import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module.js';
import { SESSION_VERIFIER } from './application/ports/session-verifier.port.js';
import { VerifySession } from './application/verify-session.js';
import { Sha256SessionTokenHasher } from './infrastructure/crypto/sha256-session-token-hasher.js';
import { PostgresSessionReader } from './infrastructure/persistence/postgres-session-reader.js';
import { SessionGuard } from './presentation/http/session.guard.js';

@Module({
  imports: [DatabaseModule],
  providers: [
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
