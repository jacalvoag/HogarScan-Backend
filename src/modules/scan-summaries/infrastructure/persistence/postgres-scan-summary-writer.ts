import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { POSTGRES_POOL } from '../../../../shared/database/postgres-pool.token.js';
import type {
  SaveSummaryResult,
  ScanSummaryWriter,
} from '../../application/ports/scan-summary-writer.port.js';
import { createScanSummary } from '../../domain/scan-summary.js';
import type { ScanSummary } from '../../domain/scan-summary.js';

@Injectable()
export class PostgresScanSummaryWriter implements ScanSummaryWriter {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async save(userId: string, summary: ScanSummary): Promise<SaveSummaryResult> {
    const canonical = createScanSummary(summary);
    const client = await this.pool.connect();
    let discard = false;

    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      const result = await this.saveLocked(client, userId, canonical);
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

  /** All summary mutations must lock the account before touching its summaries. */
  private async saveLocked(
    client: PoolClient,
    userId: string,
    summary: ScanSummary,
  ): Promise<SaveSummaryResult> {
    const { rows: accounts } = await client.query<{
      summary_generation: number;
    }>(`SELECT summary_generation FROM public.users WHERE id = $1 FOR UPDATE`, [
      userId,
    ]);

    const account = accounts[0];
    if (account === undefined) return { status: 'ACCOUNT_NOT_FOUND' };

    const currentGeneration = account.summary_generation;

    if (summary.summaryGeneration !== currentGeneration) {
      return {
        status:
          summary.summaryGeneration < currentGeneration
            ? 'STALE_GENERATION'
            : 'FUTURE_GENERATION',
        currentGeneration,
      };
    }

    const counts = summary.findingsByCategory;
    const values = [
      userId,
      summary.scanId,
      summary.summaryGeneration,
      new Date(summary.startedAt),
      new Date(summary.finishedAt),
      summary.addressesScanned,
      summary.addressesResponded,
      summary.acceptedServices,
      counts.TCP_SERVICE_ACCESSIBLE,
      counts.PROTOCOL_IDENTIFIED,
      counts.PREVENTIVE_REVIEW,
      counts.POSSIBLE_CVE_MATCH,
      counts.INSUFFICIENT_EVIDENCE,
    ];

    const { rows: existing } = await client.query<{
      received_at: Date;
      identical: boolean;
    }>(
      `SELECT received_at,
         (summary_generation = $3 AND started_at = $4::timestamptz
          AND finished_at = $5::timestamptz AND addresses_scanned = $6
          AND addresses_responded = $7 AND accepted_services = $8
          AND tcp_service_accessible = $9 AND protocol_identified = $10
          AND preventive_review = $11 AND possible_cve_match = $12
          AND insufficient_evidence = $13) AS identical
       FROM public.scan_summaries WHERE user_id = $1 AND scan_id = $2`,
      values,
    );

    const previous = existing[0];

    if (previous !== undefined) {
      return previous.identical
        ? {
            status: 'SAVED',
            receipt: {
              scanId: summary.scanId,
              summaryGeneration: currentGeneration,
              receivedAt: previous.received_at,
              created: false,
            },
          }
        : { status: 'CONFLICT' };
    }

    const { rows: inserted } = await client.query<{ received_at: Date }>(
      `INSERT INTO public.scan_summaries (
         user_id, scan_id, summary_generation, started_at, finished_at,
         addresses_scanned, addresses_responded, accepted_services,
         tcp_service_accessible, protocol_identified, preventive_review,
         possible_cve_match, insufficient_evidence
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING received_at`,
      values,
    );

    const row = inserted[0];

    if (row === undefined)
      throw new Error('Summary insert returned no receipt.');

    return {
      status: 'SAVED',
      receipt: {
        scanId: summary.scanId,
        summaryGeneration: currentGeneration,
        receivedAt: row.received_at,
        created: true,
      },
    };
  }
}
