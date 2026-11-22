import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { POSTGRES_POOL } from '../../../../shared/database/postgres-pool.token.js';
import type {
  CredentialsReader,
  UserCredentials,
} from '../../application/ports/credentials-reader.port.js';

interface CredentialsRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
  summary_generation: number;
}

@Injectable()
export class PostgresCredentialsReader implements CredentialsReader {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async findByEmail(normalizedEmail: string): Promise<UserCredentials | null> {
    const { rows } = await this.pool.query<CredentialsRow>(
      `SELECT id, email, password_hash, created_at, summary_generation
       FROM public.users
       WHERE email = $1`,
      [normalizedEmail],
    );

    const row = rows[0];
    if (row === undefined) return null;

    return {
      user: {
        id: row.id,
        email: row.email,
        createdAt: row.created_at,
      },
      passwordHash: row.password_hash,
      summaryGeneration: row.summary_generation,
    };
  }
}
