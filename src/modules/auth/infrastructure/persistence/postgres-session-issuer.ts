import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { authConfig } from '../../../../config/auth.config.js';
import type { AuthConfig } from '../../../../config/auth.config.js';
import { POSTGRES_POOL } from '../../../../shared/database/postgres-pool.token.js';
import type {
  IssuedSession,
  SessionIssuer,
} from '../../application/ports/session-issuer.port.js';
import type { SessionTokenHasher } from '../../application/ports/session-token-hasher.port.js';
import { Sha256SessionTokenHasher } from '../crypto/sha256-session-token-hasher.js';

@Injectable()
export class PostgresSessionIssuer implements SessionIssuer {
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    @Inject(Sha256SessionTokenHasher)
    private readonly hasher: SessionTokenHasher,
    @Inject(authConfig.KEY) private readonly config: AuthConfig,
  ) {}

  async issue(userId: string): Promise<IssuedSession> {
    const accessToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hasher.hash(accessToken);

    const { rows } = await this.pool.query<{ expires_at: Date }>(
      `INSERT INTO public.sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP + $3::integer * INTERVAL '1 second')
       RETURNING expires_at`,
      [tokenHash, userId, this.config.sessionTtlSeconds],
    );

    const row = rows[0];

    if (row === undefined) {
      throw new Error('Session insert returned no expiration.');
    }

    return { accessToken, expiresAt: row.expires_at };
  }
}
