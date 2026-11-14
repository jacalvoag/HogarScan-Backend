import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { POSTGRES_POOL } from '../../../shared/database/postgres-pool.token.js';

@Injectable()
export class PostgresReadiness {
  private pending: Promise<boolean> | undefined;

  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  check(): Promise<boolean> {
    if (this.pending !== undefined) return this.pending;

    this.pending = this.probe().finally(() => {
      this.pending = undefined;
    });

    return this.pending;
  }

  private async probe(): Promise<boolean> {
    try {
      const query = {
        text: 'SELECT 1 AS ready',
        query_timeout: 1_000,
      };

      const { rows } = await this.pool.query<{ ready: number }>(query);

      return rows[0]?.ready === 1;
    } catch {
      return false;
    }
  }
}
