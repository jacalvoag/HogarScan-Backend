import { Pool } from 'pg';
import { PostgresUserStatisticsReader } from './postgres-user-statistics-reader.js';

describe('PostgresUserStatisticsReader', () => {
  const userId = '6ba63463-9073-43d1-9b60-2fd868798cc0';
  const generatedAt = new Date('2026-11-10T16:02:00Z');
  const startedAt = new Date('2026-11-10T16:00:00Z');

  const row = {
    summary_generation: 2,
    generated_at: generatedAt,
    total_scans: '12',
    total_addresses_scanned: '60',
    total_addresses_responded: '24',
    total_accepted_services: '36',
    finding_counts: ['36', '12', '0', '0', '48'],
    scan_id: '6ce5e6b1-9509-48a7-bc9d-f0f872364726',
    started_at: startedAt,
    accepted_services: 3,
    recent_finding_counts: [3, 1, 0, 0, 4],
  };

  const pool = new Pool();
  const reader = new PostgresUserStatisticsReader(pool);
  const query = vi.spyOn(pool, 'query');

  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async () => ({ rows: [row] }));
  });

  afterAll(async () => {
    await pool.end();
    vi.restoreAllMocks();
  });

  it('reads one account in one statement and maps database counts', async () => {
    await expect(reader.read(userId)).resolves.toEqual({
      summaryGeneration: 2,
      generatedAt,
      totalScans: 12,
      totalAddressesScanned: 60,
      totalAddressesResponded: 24,
      totalAcceptedServices: 36,
      findingsByCategory: {
        TCP_SERVICE_ACCESSIBLE: 36,
        PROTOCOL_IDENTIFIED: 12,
        PREVENTIVE_REVIEW: 0,
        POSSIBLE_CVE_MATCH: 0,
        INSUFFICIENT_EVIDENCE: 48,
      },
      recentScans: [
        {
          scanId: row.scan_id,
          startedAt,
          acceptedServices: 3,
          findingsByCategory: {
            TCP_SERVICE_ACCESSIBLE: 3,
            PROTOCOL_IDENTIFIED: 1,
            PREVENTIVE_REVIEW: 0,
            POSSIBLE_CVE_MATCH: 0,
            INSUFFICIENT_EVIDENCE: 4,
          },
        },
      ],
    });

    expect(query).toHaveBeenCalledExactlyOnceWith(expect.any(String), [userId]);
  });

  it('returns zero totals and an empty series for an account without scans', async () => {
    query.mockImplementationOnce(async () => ({
      rows: [
        {
          ...row,
          total_scans: '0',
          total_addresses_scanned: '0',
          total_addresses_responded: '0',
          total_accepted_services: '0',
          finding_counts: ['0', '0', '0', '0', '0'],
          scan_id: null,
          started_at: null,
          accepted_services: null,
          recent_finding_counts: null,
        },
      ],
    }));

    const result = await reader.read(userId);

    expect(result).toMatchObject({
      summaryGeneration: 2,
      totalScans: 0,
      totalAddressesScanned: 0,
      totalAddressesResponded: 0,
      totalAcceptedServices: 0,
      findingsByCategory: {
        TCP_SERVICE_ACCESSIBLE: 0,
        PROTOCOL_IDENTIFIED: 0,
        PREVENTIVE_REVIEW: 0,
        POSSIBLE_CVE_MATCH: 0,
        INSUFFICIENT_EVIDENCE: 0,
      },
      recentScans: [],
    });
  });

  it('distinguishes a missing account from an empty one', async () => {
    query.mockImplementationOnce(async () => ({ rows: [] }));

    await expect(reader.read(userId)).resolves.toBeNull();
  });

  it('accepts aggregate categories above the per-scan limit', async () => {
    query.mockImplementationOnce(async () => ({
      rows: [
        {
          ...row,
          finding_counts: ['100001', '12', '0', '0', '48'],
        },
      ],
    }));

    expect(
      (await reader.read(userId))?.findingsByCategory.TCP_SERVICE_ACCESSIBLE,
    ).toBe(100001);
  });

  it('preserves the largest safe integer exactly', async () => {
    query.mockImplementationOnce(async () => ({
      rows: [
        {
          ...row,
          total_addresses_scanned: String(Number.MAX_SAFE_INTEGER),
        },
      ],
    }));

    expect((await reader.read(userId))?.totalAddressesScanned).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it.each(['9007199254740992', '9007199254740993', '-1', '1.5', '', '1\n'])(
    'rejects an unsafe or malformed aggregate: %j',
    async (value) => {
      query.mockImplementationOnce(async () => ({
        rows: [{ ...row, total_scans: value }],
      }));

      await expect(reader.read(userId)).rejects.toBeInstanceOf(RangeError);
    },
  );

  it('rejects an unsafe JSONB category before returning rounded data', async () => {
    query.mockImplementationOnce(async () => ({
      rows: [
        {
          ...row,
          finding_counts: ['36', '12', '0', '0', '9007199254740993'],
        },
      ],
    }));

    await expect(reader.read(userId)).rejects.toBeInstanceOf(RangeError);
  });

  it('propagates database failures instead of inventing zero statistics', async () => {
    const failure = new Error('Database unavailable');

    query.mockImplementationOnce(async () => {
      throw failure;
    });

    await expect(reader.read(userId)).rejects.toBe(failure);
  });
});
