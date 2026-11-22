import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { POSTGRES_POOL } from '../../../../shared/database/postgres-pool.token.js';
import type {
  SessionReader,
  SessionRecord,
} from '../../application/ports/session-reader.port.js';

interface SessionRow {
  user_id: string;
  expires_at: Date;
  revoked_at: Date | null;
}

@Injectable()
export class PostgresSessionReader implements SessionReader {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const { rows } = await this.pool.query<SessionRow>(
      `SELECT user_id, expires_at, revoked_at
       FROM public.sessions
       WHERE token_hash = $1`,
      [tokenHash],
    );

    const row = rows[0];
    if (row === undefined) return null;

    return {
      userId: row.user_id,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    };
  }
}
