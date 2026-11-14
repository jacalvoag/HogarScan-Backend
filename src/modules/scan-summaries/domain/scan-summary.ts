export interface FindingCounts {
  readonly TCP_SERVICE_ACCESSIBLE: number;
  readonly PROTOCOL_IDENTIFIED: number;
  readonly PREVENTIVE_REVIEW: number;
  readonly POSSIBLE_CVE_MATCH: number;
  readonly INSUFFICIENT_EVIDENCE: number;
}

export interface ScanSummary {
  readonly scanId: string;
  readonly summaryGeneration: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly addressesScanned: number;
  readonly addressesResponded: number;
  readonly acceptedServices: number;
  readonly findingsByCategory: FindingCounts;
}

export class InvalidScanSummaryError extends Error {
  constructor(readonly field: keyof ScanSummary) {
    super(`Invalid scan summary: ${field}`);
    this.name = 'InvalidScanSummaryError';
  }
}

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  field: keyof ScanSummary,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new InvalidScanSummaryError(field);
  }
}

function canonicalTimestamp(
  value: string,
  field: 'startedAt' | 'finishedAt',
): string {
  const match =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z(?![\s\S])/.exec(
      value,
    );

  if (match === null) throw new InvalidScanSummaryError(field);

  const canonical = `${match[1]}.${(match[2] ?? '').padEnd(3, '0')}Z`;
  const date = new Date(canonical);

  if (!Number.isFinite(date.getTime()) || date.toISOString() !== canonical) {
    throw new InvalidScanSummaryError(field);
  }

  return canonical;
}

/** Validates decoded domain data; HTTP shape validation belongs to the adapter. */
export function createScanSummary(input: ScanSummary): ScanSummary {
  if (
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}(?![\s\S])/i.test(
      input.scanId,
    )
  ) {
    throw new InvalidScanSummaryError('scanId');
  }

  requireInteger(
    input.summaryGeneration,
    0,
    2_147_483_647,
    'summaryGeneration',
  );
  requireInteger(input.addressesScanned, 1, 254, 'addressesScanned');
  requireInteger(
    input.addressesResponded,
    0,
    input.addressesScanned,
    'addressesResponded',
  );
  requireInteger(
    input.acceptedServices,
    0,
    input.addressesResponded * 6,
    'acceptedServices',
  );

  const counts: FindingCounts = {
    TCP_SERVICE_ACCESSIBLE: input.findingsByCategory.TCP_SERVICE_ACCESSIBLE,
    PROTOCOL_IDENTIFIED: input.findingsByCategory.PROTOCOL_IDENTIFIED,
    PREVENTIVE_REVIEW: input.findingsByCategory.PREVENTIVE_REVIEW,
    POSSIBLE_CVE_MATCH: input.findingsByCategory.POSSIBLE_CVE_MATCH,
    INSUFFICIENT_EVIDENCE: input.findingsByCategory.INSUFFICIENT_EVIDENCE,
  };

  for (const count of Object.values(counts)) {
    requireInteger(count, 0, 100_000, 'findingsByCategory');
  }

  return Object.freeze({
    scanId: input.scanId.toLowerCase(),
    summaryGeneration: input.summaryGeneration,
    startedAt: canonicalTimestamp(input.startedAt, 'startedAt'),
    finishedAt: canonicalTimestamp(input.finishedAt, 'finishedAt'),
    addressesScanned: input.addressesScanned,
    addressesResponded: input.addressesResponded,
    acceptedServices: input.acceptedServices,
    findingsByCategory: Object.freeze(counts),
  });
}
