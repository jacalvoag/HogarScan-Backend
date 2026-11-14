import type { ScanSummary } from '../../domain/scan-summary.js';

export const SCAN_SUMMARY_WRITER = Symbol('SCAN_SUMMARY_WRITER');

export interface ScanSummaryReceipt {
  readonly scanId: string;
  readonly summaryGeneration: number;
  readonly receivedAt: Date;
  readonly created: boolean;
}

export type SaveSummaryResult =
  | { readonly status: 'SAVED'; readonly receipt: ScanSummaryReceipt }
  | {
      readonly status: 'STALE_GENERATION' | 'FUTURE_GENERATION';
      readonly currentGeneration: number;
    }
  | { readonly status: 'CONFLICT' | 'ACCOUNT_NOT_FOUND' };

export interface ScanSummaryWriter {
  save(userId: string, summary: ScanSummary): Promise<SaveSummaryResult>;
}
