import { Pool } from 'pg';
import { PostgresReadiness } from './postgres-readiness.js';

describe('PostgresReadiness', () => {
  const pool = new Pool();
  const readiness = new PostgresReadiness(pool);
  const query = vi.spyOn(pool, 'query');

  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async () => ({ rows: [{ ready: 1 }] }));
  });

  afterAll(async () => {
    await pool.end();
    vi.restoreAllMocks();
  });

  it('checks the database with a bounded query', async () => {
    await expect(readiness.check()).resolves.toBe(true);

    expect(query).toHaveBeenCalledExactlyOnceWith({
      text: 'SELECT 1 AS ready',
      query_timeout: 1_000,
    });
  });

  it('rejects an unexpected query result', async () => {
    query.mockImplementationOnce(async () => ({ rows: [] }));

    await expect(readiness.check()).resolves.toBe(false);
  });

  it('reports database failure without exposing its error', async () => {
    query.mockImplementationOnce(async () => {
      throw new Error('PRIVATE_DATABASE_DETAILS');
    });

    await expect(readiness.check()).resolves.toBe(false);
  });

  it('shares a pending probe and starts a fresh one after completion', async () => {
    let complete!: (result: { rows: { ready: number }[] }) => void;

    const pending = new Promise<{ rows: { ready: number }[] }>((resolve) => {
      complete = resolve;
    });

    query.mockImplementationOnce(async () => pending);

    const first = readiness.check();
    const second = readiness.check();

    expect(second).toBe(first);
    expect(query).toHaveBeenCalledOnce();

    complete({ rows: [{ ready: 1 }] });

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);

    await expect(readiness.check()).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('allows recovery after a shared failed probe', async () => {
    query.mockImplementationOnce(async () => {
      throw new Error('Query read timeout');
    });

    const first = readiness.check();
    const second = readiness.check();

    expect(second).toBe(first);

    await expect(Promise.all([first, second])).resolves.toEqual([false, false]);

    await expect(readiness.check()).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
