import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { POSTGRES_POOL } from '../../../../shared/database/postgres-pool.token.js';
import type { UserCreator } from '../../application/ports/user-creator.port.js';
import type { User } from '../../domain/user.js';

interface UserRow {
  id: string;
  email: string;
  created_at: Date;
}

@Injectable()
export class PostgresUserCreator implements UserCreator {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async create(email: string, passwordHash: string): Promise<User | null> {
    const { rows } = await this.pool.query<UserRow>(
      `INSERT INTO public.users (email, password_hash)
       VALUES ($1, $2)
       ON CONFLICT ON CONSTRAINT users_email_key DO NOTHING
       RETURNING id, email, created_at`,
      [email, passwordHash],
    );

    const row = rows[0];
    if (row === undefined) return null;

    return {
      id: row.id,
      email: row.email,
      createdAt: row.created_at,
    };
  }
}
