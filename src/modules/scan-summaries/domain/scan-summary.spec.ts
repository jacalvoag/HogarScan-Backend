import { createScanSummary, InvalidScanSummaryError } from './scan-summary.js';
import type { FindingCounts, ScanSummary } from './scan-summary.js';

describe('Scan summary', () => {
  const input: ScanSummary = {
    scanId: '6CE5E6B1-9509-48A7-BC9D-F0F872364726',
    summaryGeneration: 0,
    startedAt: '2026-11-10T16:00:00Z',
    finishedAt: '2026-11-10T16:01:00.1Z',
    addressesScanned: 5,
    addressesResponded: 2,
    acceptedServices: 3,
    findingsByCategory: {
      TCP_SERVICE_ACCESSIBLE: 3,
      PROTOCOL_IDENTIFIED: 1,
      PREVENTIVE_REVIEW: 0,
      POSSIBLE_CVE_MATCH: 0,
      INSUFFICIENT_EVIDENCE: 4,
    },
  };

  it('canonicalizes equivalent identifiers and timestamps', () => {
    const result = createScanSummary(input);

    expect(result.scanId).toBe(input.scanId.toLowerCase());
    expect(result.startedAt).toBe('2026-11-10T16:00:00.000Z');
    expect(result.finishedAt).toBe('2026-11-10T16:01:00.100Z');

    expect(
      createScanSummary({
        ...input,
        scanId: result.scanId,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
      }),
    ).toEqual(result);
  });

  it('preserves dates when the phone clock moves backwards', () => {
    const result = createScanSummary({
      ...input,
      finishedAt: '2026-11-10T15:59:00Z',
    });

    expect(result.finishedAt).toBe('2026-11-10T15:59:00.000Z');
  });

  it('accepts a valid leap day and two fractional digits', () => {
    expect(
      createScanSummary({ ...input, startedAt: '2024-02-29T23:59:59.12Z' })
        .startedAt,
    ).toBe('2024-02-29T23:59:59.120Z');
  });

  it('keeps findings independent from address and service counts', () => {
    const counts: FindingCounts = {
      TCP_SERVICE_ACCESSIBLE: 100_000,
      PROTOCOL_IDENTIFIED: 100_000,
      PREVENTIVE_REVIEW: 100_000,
      POSSIBLE_CVE_MATCH: 100_000,
      INSUFFICIENT_EVIDENCE: 100_000,
    };

    expect(
      createScanSummary({ ...input, findingsByCategory: counts })
        .findingsByCategory,
    ).toEqual(counts);
  });

  it.each([
    { addressesScanned: 1, addressesResponded: 0, acceptedServices: 0 },
    {
      addressesScanned: 254,
      addressesResponded: 254,
      acceptedServices: 1524,
      summaryGeneration: 2_147_483_647,
    },
  ])('accepts boundary values: %j', (values) => {
    expect(() => createScanSummary({ ...input, ...values })).not.toThrow();
  });

  it('copies and freezes the summary and its nested counts', () => {
    const counts = { ...input.findingsByCategory };
    const result = createScanSummary({ ...input, findingsByCategory: counts });

    counts.TCP_SERVICE_ACCESSIBLE = 99;

    expect(result.findingsByCategory.TCP_SERVICE_ACCESSIBLE).toBe(3);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.findingsByCategory)).toBe(true);
    expect(input.startedAt).toBe('2026-11-10T16:00:00Z');
  });

  it.each([
    { scanId: 'invalid' },
    { scanId: `${input.scanId}\n` },
    { summaryGeneration: -1 },
    { summaryGeneration: 2_147_483_648 },
    { summaryGeneration: 0.5 },
    { addressesScanned: 0 },
    { addressesScanned: 255 },
    { addressesResponded: -1 },
    { addressesResponded: 6 },
    { acceptedServices: -1 },
    { acceptedServices: 13 },
    { acceptedServices: 0.5 },
    { acceptedServices: Number.NaN },
    { addressesScanned: Number.POSITIVE_INFINITY },
  ])('rejects invalid identifiers and counts: %j', (values) => {
    expect(() => createScanSummary({ ...input, ...values })).toThrow(
      InvalidScanSummaryError,
    );
  });

  it.each([-1, 100_001, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid category count: %s',
    (count) => {
      expect(() =>
        createScanSummary({
          ...input,
          findingsByCategory: {
            ...input.findingsByCategory,
            PREVENTIVE_REVIEW: count,
          },
        }),
      ).toThrow(InvalidScanSummaryError);
    },
  );

  it.each(['startedAt', 'finishedAt'] as const)(
    'rejects invalid %s',
    (field) => {
      for (const timestamp of [
        '2026-02-29T12:00:00Z',
        '2026-04-31T12:00:00Z',
        '2026-11-10T24:00:00Z',
        '2026-11-10T16:00:00.1234Z',
        '2026-11-10T16:00:00+00:00',
        '2026-11-10T16:00:00Z\n',
      ]) {
        expect(() =>
          createScanSummary({ ...input, [field]: timestamp }),
        ).toThrow(InvalidScanSummaryError);
      }
    },
  );
});
