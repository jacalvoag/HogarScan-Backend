import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { POSTGRES_POOL } from '../../../../shared/database/postgres-pool.token.js';
import type {
  DeleteSummariesResult,
  ScanSummaryDeleter,
} from '../../application/ports/scan-summary-deleter.port.js';

const MAX_GENERATION = 2_147_483_647;

@Injectable()
export class PostgresScanSummaryDeleter implements ScanSummaryDeleter {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async deleteAll(
    userId: string,
    expectedGeneration: number,
  ): Promise<DeleteSummariesResult> {
    if (
      !Number.isInteger(expectedGeneration) ||
      expectedGeneration < 0 ||
      expectedGeneration > MAX_GENERATION
    ) {
      throw new RangeError('Invalid expected summary generation.');
    }

    const client = await this.pool.connect();
    let discard = false;

    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');

      const result = await this.deleteLocked(
        client,
        userId,
        expectedGeneration,
      );

      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        discard = true;
      }

      throw error;
    } finally {
      client.release(discard);
    }
  }

  private async deleteLocked(
    client: PoolClient,
    userId: string,
    expectedGeneration: number,
  ): Promise<DeleteSummariesResult> {
    // Same account lock as the writer, acquired before touching summaries.
    const { rows: accounts } = await client.query<{
      summary_generation: number;
    }>(`SELECT summary_generation FROM public.users WHERE id = $1 FOR UPDATE`, [
      userId,
    ]);

    const account = accounts[0];

    if (account === undefined) {
      return { status: 'ACCOUNT_NOT_FOUND' };
    }

    const currentGeneration = account.summary_generation;

    if (expectedGeneration !== currentGeneration) {
      return {
        status:
          expectedGeneration < currentGeneration
            ? 'STALE_GENERATION'
            : 'FUTURE_GENERATION',
        currentGeneration,
      };
    }

    if (currentGeneration === MAX_GENERATION) {
      throw new RangeError('Summary generation exhausted.');
    }

    const { rowCount } = await client.query(
      'DELETE FROM public.scan_summaries WHERE user_id = $1',
      [userId],
    );

    if (rowCount === null || !Number.isSafeInteger(rowCount) || rowCount < 0) {
      throw new Error('Invalid deleted summary count.');
    }

    const { rows: updated } = await client.query<{
      summary_generation: number;
      deleted_at: Date;
    }>(
      `UPDATE public.users SET summary_generation = summary_generation + 1
       WHERE id = $1
       RETURNING summary_generation, clock_timestamp() AS deleted_at`,
      [userId],
    );

    const receipt = updated[0];

    if (receipt === undefined) {
      throw new Error('Summary deletion returned no generation receipt.');
    }

    return {
      status: 'DELETED',
      receipt: {
        deletedCount: rowCount,
        summaryGeneration: receipt.summary_generation,
        deletedAt: receipt.deleted_at,
      },
    };
  }
}
