import type { FindingCounts } from '../../domain/scan-summary.js';

export const USER_STATISTICS_READER = Symbol('USER_STATISTICS_READER');

export interface RecentScanStatistics {
  readonly scanId: string;
  readonly startedAt: Date;
  readonly acceptedServices: number;
  readonly findingsByCategory: FindingCounts;
}

export interface UserStatistics {
  readonly summaryGeneration: number;
  readonly generatedAt: Date;
  readonly totalScans: number;
  readonly totalAddressesScanned: number;
  readonly totalAddressesResponded: number;
  readonly totalAcceptedServices: number;
  readonly findingsByCategory: FindingCounts;
  readonly recentScans: readonly RecentScanStatistics[];
}

export interface UserStatisticsReader {
  read(userId: string): Promise<UserStatistics | null>;
}
