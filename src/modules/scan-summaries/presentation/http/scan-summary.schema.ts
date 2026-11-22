import { z } from 'zod';
import {
  createScanSummary,
  InvalidScanSummaryError,
} from '../../domain/scan-summary.js';
import type { ScanSummary } from '../../domain/scan-summary.js';

const requestShape = z.strictObject({
  scan_id: z.string(),
  summary_generation: z.number(),
  started_at: z.string(),
  finished_at: z.string(),
  addresses_scanned: z.number(),
  addresses_responded: z.number(),
  accepted_services: z.number(),
  findings_by_category: z.strictObject({
    TCP_SERVICE_ACCESSIBLE: z.number(),
    PROTOCOL_IDENTIFIED: z.number(),
    PREVENTIVE_REVIEW: z.number(),
    POSSIBLE_CVE_MATCH: z.number(),
    INSUFFICIENT_EVIDENCE: z.number(),
  }),
});

export type ScanSummaryBody = z.infer<typeof requestShape>;

export function toScanSummaryInput(body: ScanSummaryBody): ScanSummary {
  return {
    scanId: body.scan_id,
    summaryGeneration: body.summary_generation,
    startedAt: body.started_at,
    finishedAt: body.finished_at,
    addressesScanned: body.addresses_scanned,
    addressesResponded: body.addresses_responded,
    acceptedServices: body.accepted_services,
    findingsByCategory: body.findings_by_category,
  };
}

export const scanSummarySchema = requestShape.superRefine((body, context) => {
  try {
    createScanSummary(toScanSummaryInput(body));
  } catch (error) {
    if (!(error instanceof InvalidScanSummaryError)) throw error;

    context.addIssue({ code: 'custom', message: 'Invalid scan summary' });
  }
});
