import { Client, Pool } from 'pg';
import { PostgresScanSummaryDeleter } from './postgres-scan-summary-deleter.js';

describe('PostgresScanSummaryDeleter', () => {
  const userId = '6ba63463-9073-43d1-9b60-2fd868798cc0';
  const deletedAt = new Date('2026-11-10T17:00:00Z');
  const failure = new Error('Database unavailable');

  let generation: number | null;
  let deletedCount: number | null;
  let updateReturnsReceipt: boolean;
  let failAt: string | undefined;
  let rollbackFails: boolean;

  const release = vi.fn();
  const client = Object.assign(new Client(), { release });
  const pool = new Pool();
  const deleter = new PostgresScanSummaryDeleter(pool);

  const connect = vi
    .spyOn(pool, 'connect')
    .mockImplementation(async () => client);

  const query = vi.spyOn(client, 'query');

  beforeEach(() => {
    generation = 1;
    deletedCount = 2;
    updateReturnsReceipt = true;
    failAt = undefined;
    rollbackFails = false;

    release.mockClear();
    connect.mockClear();
    query.mockReset();

    query.mockImplementation(async (sql) => {
      if (typeof sql !== 'string') {
        throw new Error('Expected SQL text');
      }

      if (sql === 'ROLLBACK' && rollbackFails) {
        throw new Error('Rollback failed');
      }

      if (failAt !== undefined && sql.includes(failAt)) {
        throw failure;
      }

      if (sql.includes('FROM public.users')) {
        return {
          rows: generation === null ? [] : [{ summary_generation: generation }],
        };
      }

      if (sql.startsWith('DELETE')) {
        return { rows: [], rowCount: deletedCount };
      }

      if (sql.startsWith('UPDATE')) {
        return {
          rows: updateReturnsReceipt
            ? [
                {
                  summary_generation: (generation ?? 0) + 1,
                  deleted_at: deletedAt,
                },
              ]
            : [],
        };
      }

      return { rows: [] };
    });
  });

  afterAll(async () => {
    await pool.end();
    vi.restoreAllMocks();
  });

  it('locks, deletes and advances the generation on one client before committing', async () => {
    await expect(deleter.deleteAll(userId, 1)).resolves.toEqual({
      status: 'DELETED',
      receipt: { deletedCount: 2, summaryGeneration: 2, deletedAt },
    });

    expect(connect).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledTimes(5);

    expect(query).toHaveBeenNthCalledWith(
      1,
      'BEGIN ISOLATION LEVEL READ COMMITTED',
    );

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('WHERE id = $1 FOR UPDATE'),
      [userId],
    );

    expect(query).toHaveBeenNthCalledWith(
      3,
      'DELETE FROM public.scan_summaries WHERE user_id = $1',
      [userId],
    );

    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('summary_generation = summary_generation + 1'),
      [userId],
    );

    expect(query).toHaveBeenLastCalledWith('COMMIT');
    expect(release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('advances the generation even when there are no summaries', async () => {
    deletedCount = 0;

    await expect(deleter.deleteAll(userId, 1)).resolves.toEqual({
      status: 'DELETED',
      receipt: { deletedCount: 0, summaryGeneration: 2, deletedAt },
    });

    expect(query).toHaveBeenCalledTimes(5);
  });

  it.each([
    [0, 'STALE_GENERATION'],
    [2, 'FUTURE_GENERATION'],
  ] as const)(
    'rejects generation %s before deleting or incrementing',
    async (expected, status) => {
      await expect(deleter.deleteAll(userId, expected)).resolves.toEqual({
        status,
        currentGeneration: 1,
      });

      expect(query).toHaveBeenCalledTimes(3);
      expect(query).toHaveBeenLastCalledWith('COMMIT');
      expect(release).toHaveBeenCalledExactlyOnceWith(false);
    },
  );

  it('reports a missing account without touching summaries', async () => {
    generation = null;

    await expect(deleter.deleteAll(userId, 1)).resolves.toEqual({
      status: 'ACCOUNT_NOT_FOUND',
    });

    expect(query).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenLastCalledWith('COMMIT');
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    'rejects an invalid expected generation before connecting: %s',
    async (expected) => {
      await expect(deleter.deleteAll(userId, expected)).rejects.toBeInstanceOf(
        RangeError,
      );

      expect(connect).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('rejects generation exhaustion before deleting anything', async () => {
    generation = 2_147_483_647;

    await expect(deleter.deleteAll(userId, generation)).rejects.toThrow(
      'Summary generation exhausted.',
    );

    expect(query).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('allows the final valid increment', async () => {
    generation = 2_147_483_646;

    await expect(deleter.deleteAll(userId, generation)).resolves.toEqual({
      status: 'DELETED',
      receipt: { deletedCount: 2, summaryGeneration: 2_147_483_647, deletedAt },
    });
  });

  it.each([
    'BEGIN',
    'FOR UPDATE',
    'DELETE FROM',
    'UPDATE public.users',
    'COMMIT',
  ])(
    'rolls back and releases the client after failure at %s',
    async (stage) => {
      failAt = stage;

      await expect(deleter.deleteAll(userId, 1)).rejects.toBe(failure);

      expect(query).toHaveBeenLastCalledWith('ROLLBACK');
      expect(release).toHaveBeenCalledExactlyOnceWith(false);
    },
  );

  it('discards the client if rollback fails and preserves the original error', async () => {
    failAt = 'DELETE FROM';
    rollbackFails = true;

    await expect(deleter.deleteAll(userId, 1)).rejects.toBe(failure);

    expect(release).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('propagates connection failure without starting a transaction', async () => {
    connect.mockImplementationOnce(async () => {
      throw failure;
    });

    await expect(deleter.deleteAll(userId, 1)).rejects.toBe(failure);

    expect(query).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it('rolls back the deletion if the generation receipt is missing', async () => {
    updateReturnsReceipt = false;

    await expect(deleter.deleteAll(userId, 1)).rejects.toThrow(
      'Summary deletion returned no generation receipt.',
    );

    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('rolls back if the deletion count is unavailable', async () => {
    deletedCount = null;

    await expect(deleter.deleteAll(userId, 1)).rejects.toThrow(
      'Invalid deleted summary count.',
    );

    expect(query).toHaveBeenCalledTimes(4);
    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
  });
});
