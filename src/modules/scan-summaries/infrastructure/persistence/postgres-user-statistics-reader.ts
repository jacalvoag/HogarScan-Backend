import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { POSTGRES_POOL } from '../../../../shared/database/postgres-pool.token.js';
import type {
  UserStatistics,
  UserStatisticsReader,
} from '../../application/ports/user-statistics-reader.port.js';
import type { FindingCounts } from '../../domain/scan-summary.js';

interface StatisticsRow {
  summary_generation: number;
  generated_at: Date;
  total_scans: string;
  total_addresses_scanned: string;
  total_addresses_responded: string;
  total_accepted_services: string;
  finding_counts: string[];
  scan_id: string | null;
  started_at: Date | null;
  accepted_services: number | null;
  recent_finding_counts: number[] | null;
}

function readCount(value: unknown): number {
  if (typeof value === 'string' && value.length > 0 && !/[^0-9]/.test(value)) {
    value = Number(value);
  }

  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Invalid or unsafe statistics count.');
  }

  return value;
}

function readFindings(values: readonly unknown[]): FindingCounts {
  if (values.length !== 5) {
    throw new Error('Invalid statistics categories.');
  }

  return {
    TCP_SERVICE_ACCESSIBLE: readCount(values[0]),
    PROTOCOL_IDENTIFIED: readCount(values[1]),
    PREVENTIVE_REVIEW: readCount(values[2]),
    POSSIBLE_CVE_MATCH: readCount(values[3]),
    INSUFFICIENT_EVIDENCE: readCount(values[4]),
  };
}

@Injectable()
export class PostgresUserStatisticsReader implements UserStatisticsReader {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async read(userId: string): Promise<UserStatistics | null> {
    const { rows } = await this.pool.query<StatisticsRow>(
      `SELECT v.summary_generation, statement_timestamp() AS generated_at,
         v.total_scans::text, v.total_addresses_scanned::text,
         v.total_addresses_responded::text, v.total_accepted_services::text,
         ARRAY[
           v.findings_by_category ->> 'TCP_SERVICE_ACCESSIBLE',
           v.findings_by_category ->> 'PROTOCOL_IDENTIFIED',
           v.findings_by_category ->> 'PREVENTIVE_REVIEW',
           v.findings_by_category ->> 'POSSIBLE_CVE_MATCH',
           v.findings_by_category ->> 'INSUFFICIENT_EVIDENCE'
         ] AS finding_counts,
         r.scan_id, r.started_at, r.accepted_services,
         r.finding_counts AS recent_finding_counts
       FROM public.user_statistics AS v
       LEFT JOIN LATERAL (
         SELECT s.scan_id, s.started_at, s.accepted_services,
           ARRAY[s.tcp_service_accessible, s.protocol_identified,
             s.preventive_review, s.possible_cve_match,
             s.insufficient_evidence] AS finding_counts
         FROM public.scan_summaries AS s
         WHERE s.user_id = v.user_id
           AND s.summary_generation = v.summary_generation
         ORDER BY s.started_at DESC, s.scan_id ASC
         LIMIT 10
       ) AS r ON true
       WHERE v.user_id = $1
       ORDER BY r.started_at DESC, r.scan_id ASC`,
      [userId],
    );

    const first = rows[0];
    if (first === undefined) return null;

    return {
      summaryGeneration: first.summary_generation,
      generatedAt: first.generated_at,
      totalScans: readCount(first.total_scans),
      totalAddressesScanned: readCount(first.total_addresses_scanned),
      totalAddressesResponded: readCount(first.total_addresses_responded),
      totalAcceptedServices: readCount(first.total_accepted_services),
      findingsByCategory: readFindings(first.finding_counts),
      recentScans: rows.flatMap((row) => {
        if (row.scan_id === null) return [];

        if (
          row.started_at === null ||
          row.accepted_services === null ||
          row.recent_finding_counts === null
        ) {
          throw new Error('Incomplete recent scan statistics.');
        }

        return [
          {
            scanId: row.scan_id,
            startedAt: row.started_at,
            acceptedServices: readCount(row.accepted_services),
            findingsByCategory: readFindings(row.recent_finding_counts),
          },
        ];
      }),
    };
  }
}
