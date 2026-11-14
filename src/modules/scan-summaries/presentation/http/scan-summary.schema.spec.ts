import { StrictSchemaValidationPipe } from '../../../../shared/http/strict-schema-validation.pipe.js';
import { createScanSummary } from '../../domain/scan-summary.js';
import {
  scanSummarySchema,
  toScanSummaryInput,
} from './scan-summary.schema.js';

describe('Scan summary HTTP input', () => {
  const body = {
    scan_id: '6CE5E6B1-9509-48A7-BC9D-F0F872364726',
    summary_generation: 0,
    started_at: '2026-11-10T16:00:00Z',
    finished_at: '2026-11-10T16:01:00.1Z',
    addresses_scanned: 5,
    addresses_responded: 2,
    accepted_services: 3,
    findings_by_category: {
      TCP_SERVICE_ACCESSIBLE: 3,
      PROTOCOL_IDENTIFIED: 1,
      PREVENTIVE_REVIEW: 0,
      POSSIBLE_CVE_MATCH: 0,
      INSUFFICIENT_EVIDENCE: 4,
    },
  };

  it('preserves the wire body through the common pipe', async () => {
    const pipe = new StrictSchemaValidationPipe();

    await expect(
      pipe.transform(body, { type: 'body', schema: scanSummarySchema }),
    ).resolves.toBe(body);

    expect(body.scan_id).toBe('6CE5E6B1-9509-48A7-BC9D-F0F872364726');
    expect(body.started_at).toBe('2026-11-10T16:00:00Z');
  });

  it('maps the contract into canonical domain data', () => {
    const result = createScanSummary(
      toScanSummaryInput(scanSummarySchema.parse(body)),
    );

    expect(result).toEqual({
      scanId: '6ce5e6b1-9509-48a7-bc9d-f0f872364726',
      summaryGeneration: 0,
      startedAt: '2026-11-10T16:00:00.000Z',
      finishedAt: '2026-11-10T16:01:00.100Z',
      addressesScanned: 5,
      addressesResponded: 2,
      acceptedServices: 3,
      findingsByCategory: body.findings_by_category,
    });
  });

  it('allows the phone clock to move backwards', () => {
    expect(
      scanSummarySchema.safeParse({
        ...body,
        finished_at: '2026-11-10T15:59:00Z',
      }).success,
    ).toBe(true);
  });

  it.each([
    null,
    [],
    {},
    { ...body, user_id: 'forged-user' },
    { ...body, received_at: '2026-11-10T16:02:00Z' },
    {
      ...body,
      findings_by_category: { ...body.findings_by_category, EXTRA: 1 },
    },
    { ...body, findings_by_category: { TCP_SERVICE_ACCESSIBLE: 3 } },
    { ...body, scan_id: 'invalid' },
    { ...body, summary_generation: '0' },
    { ...body, addresses_scanned: '5' },
    { ...body, addresses_responded: true },
    {
      ...body,
      findings_by_category: {
        ...body.findings_by_category,
        PREVENTIVE_REVIEW: '0',
      },
    },
    { ...body, summary_generation: -1 },
    { ...body, addresses_scanned: 255 },
    { ...body, addresses_responded: 6 },
    { ...body, accepted_services: 13 },
    { ...body, accepted_services: 0.5 },
    { ...body, started_at: '2026-02-29T12:00:00Z' },
    { ...body, finished_at: '2026-11-10T16:01:00+00:00' },
    {
      ...body,
      findings_by_category: {
        ...body.findings_by_category,
        INSUFFICIENT_EVIDENCE: 100_001,
      },
    },
  ])('rejects invalid HTTP data without coercion: %j', (invalid) => {
    expect(scanSummarySchema.safeParse(invalid).success).toBe(false);
  });
});
