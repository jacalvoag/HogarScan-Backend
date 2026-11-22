import { Client, Pool } from 'pg';
import {
  createScanSummary,
  InvalidScanSummaryError,
} from '../../domain/scan-summary.js';
import { PostgresScanSummaryWriter } from './postgres-scan-summary-writer.js';

describe('PostgresScanSummaryWriter', () => {
  const userId = '6ba63463-9073-43d1-9b60-2fd868798cc0';
  const summary = createScanSummary({
    scanId: '6CE5E6B1-9509-48A7-BC9D-F0F872364726',
    summaryGeneration: 0,
    startedAt: '2026-11-10T16:00:00Z',
    finishedAt: '2026-11-10T16:01:00Z',
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
  });

  const receivedAt = new Date('2026-11-10T16:02:00.000Z');
  const originalAt = new Date('2026-11-09T16:02:00.000Z');
  const failure = new Error('Database unavailable');

  let generation: number | null;
  let existing: { received_at: Date; identical: boolean } | undefined;
  let failAt: string | undefined;
  let rollbackFails: boolean;
  let insertReturnsReceipt: boolean;

  const release = vi.fn();
  const client = Object.assign(new Client(), { release });
  const pool = new Pool();
  const writer = new PostgresScanSummaryWriter(pool);

  const connect = vi
    .spyOn(pool, 'connect')
    .mockImplementation(async () => client);

  const query = vi.spyOn(client, 'query');

  beforeEach(() => {
    generation = 0;
    existing = undefined;
    failAt = undefined;
    rollbackFails = false;
    insertReturnsReceipt = true;
    release.mockClear();
    connect.mockClear();
    query.mockReset();

    query.mockImplementation(async (sql) => {
      if (typeof sql !== 'string') throw new Error('Expected SQL text');

      if (sql === 'ROLLBACK' && rollbackFails)
        throw new Error('Rollback failed');

      if (failAt !== undefined && sql.includes(failAt)) throw failure;

      if (sql.includes('FROM public.users'))
        return {
          rows: generation === null ? [] : [{ summary_generation: generation }],
        };

      if (sql.includes('FROM public.scan_summaries'))
        return { rows: existing === undefined ? [] : [existing] };

      if (sql.includes('INSERT INTO public.scan_summaries'))
        return {
          rows: insertReturnsReceipt ? [{ received_at: receivedAt }] : [],
        };

      return { rows: [] };
    });
  });

  afterAll(async () => {
    await pool.end();
    vi.restoreAllMocks();
  });

  it('locks the account and binds the canonical content on one client', async () => {
    await expect(writer.save(userId, summary)).resolves.toEqual({
      status: 'SAVED',
      receipt: {
        scanId: summary.scanId,
        summaryGeneration: 0,
        receivedAt,
        created: true,
      },
    });

    expect(connect).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).toBe('BEGIN ISOLATION LEVEL READ COMMITTED');

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('WHERE id = $1 FOR UPDATE'),
      [userId],
    );

    const values = [
      userId,
      summary.scanId,
      0,
      new Date(summary.startedAt),
      new Date(summary.finishedAt),
      5,
      2,
      3,
      3,
      1,
      0,
      0,
      4,
    ];

    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('WHERE user_id = $1 AND scan_id = $2'),
      values,
    );

    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('INSERT INTO public.scan_summaries'),
      values,
    );

    expect(query).toHaveBeenLastCalledWith('COMMIT');
    expect(release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('preserves the original receipt for an identical replay', async () => {
    existing = { received_at: originalAt, identical: true };

    await expect(writer.save(userId, summary)).resolves.toEqual({
      status: 'SAVED',
      receipt: {
        scanId: summary.scanId,
        summaryGeneration: 0,
        receivedAt: originalAt,
        created: false,
      },
    });

    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('INSERT')),
    ).toBe(false);

    expect(query).toHaveBeenLastCalledWith('COMMIT');
  });

  it('reports conflicting content without overwriting the row', async () => {
    existing = { received_at: originalAt, identical: false };

    await expect(writer.save(userId, summary)).resolves.toEqual({
      status: 'CONFLICT',
    });

    expect(
      query.mock.calls.some(([sql]) =>
        /INSERT|UPDATE public.scan_summaries/.test(String(sql)),
      ),
    ).toBe(false);

    expect(query).toHaveBeenLastCalledWith('COMMIT');
  });

  it('reports a missing account before accessing summaries', async () => {
    generation = null;

    await expect(writer.save(userId, summary)).resolves.toEqual({
      status: 'ACCOUNT_NOT_FOUND',
    });

    expect(query).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenLastCalledWith('COMMIT');
    expect(release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it.each([
    [0, 'STALE_GENERATION'],
    [2, 'FUTURE_GENERATION'],
  ] as const)(
    'checks generation %s before an existing receipt',
    async (sentGeneration, status) => {
      generation = 1;
      existing = { received_at: originalAt, identical: true };

      await expect(
        writer.save(userId, { ...summary, summaryGeneration: sentGeneration }),
      ).resolves.toEqual({ status, currentGeneration: 1 });

      expect(query).toHaveBeenCalledTimes(3);
      expect(query).toHaveBeenLastCalledWith('COMMIT');
    },
  );

  it('rejects invalid summaries before acquiring a connection', async () => {
    await expect(
      writer.save(userId, { ...summary, addressesScanned: 0 }),
    ).rejects.toBeInstanceOf(InvalidScanSummaryError);

    expect(connect).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    'BEGIN',
    'FOR UPDATE',
    'FROM public.scan_summaries',
    'INSERT',
    'COMMIT',
  ])(
    'rolls back and releases the connection after a failure at %s',
    async (stage) => {
      failAt = stage;

      await expect(writer.save(userId, summary)).rejects.toBe(failure);

      expect(query).toHaveBeenLastCalledWith('ROLLBACK');
      expect(release).toHaveBeenCalledExactlyOnceWith(false);
    },
  );

  it('discards a connection if rollback fails and preserves the original error', async () => {
    failAt = 'INSERT';
    rollbackFails = true;

    await expect(writer.save(userId, summary)).rejects.toBe(failure);

    expect(release).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('propagates connection failures without attempting a transaction', async () => {
    connect.mockImplementationOnce(async () => {
      throw failure;
    });

    await expect(writer.save(userId, summary)).rejects.toBe(failure);

    expect(query).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it('rolls back if an insert returns no receipt', async () => {
    insertReturnsReceipt = false;

    await expect(writer.save(userId, summary)).rejects.toThrow(
      'Summary insert returned no receipt.',
    );

    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalledExactlyOnceWith(false);
  });
});
