import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { POSTGRES_POOL } from '../../../../shared/database/postgres-pool.token.js';
import type {
  CurrentSession,
  CurrentSessionStore,
} from '../../application/ports/current-session-store.port.js';

interface CurrentSessionRow {
  id: string;
  email: string;
  created_at: Date;
  summary_generation: number;
  expires_at: Date;
}

@Injectable()
export class PostgresCurrentSessionStore implements CurrentSessionStore {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async findActive(
    tokenHash: string,
    userId: string,
  ): Promise<CurrentSession | null> {
    const { rows } = await this.pool.query<CurrentSessionRow>(
      `SELECT u.id, u.email, u.created_at, u.summary_generation, s.expires_at
       FROM public.sessions AS s
       JOIN public.users AS u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.user_id = $2
         AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP`,
      [tokenHash, userId],
    );

    const row = rows[0];
    if (row === undefined) return null;

    return {
      user: { id: row.id, email: row.email, createdAt: row.created_at },
      expiresAt: row.expires_at,
      summaryGeneration: row.summary_generation,
    };
  }

  async revokeActive(tokenHash: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE public.sessions SET revoked_at = CURRENT_TIMESTAMP
       WHERE token_hash = $1 AND user_id = $2
         AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
      [tokenHash, userId],
    );

    return result.rowCount === 1;
  }
}
