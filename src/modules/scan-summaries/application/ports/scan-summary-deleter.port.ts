export const SCAN_SUMMARY_DELETER = Symbol('SCAN_SUMMARY_DELETER');

export interface DeleteSummariesReceipt {
  readonly deletedCount: number;
  readonly summaryGeneration: number;
  readonly deletedAt: Date;
}

export type DeleteSummariesResult =
  | { readonly status: 'DELETED'; readonly receipt: DeleteSummariesReceipt }
  | {
      readonly status: 'STALE_GENERATION' | 'FUTURE_GENERATION';
      readonly currentGeneration: number;
    }
  | { readonly status: 'ACCOUNT_NOT_FOUND' };

export interface ScanSummaryDeleter {
  deleteAll(
    userId: string,
    expectedGeneration: number,
  ): Promise<DeleteSummariesResult>;
}
