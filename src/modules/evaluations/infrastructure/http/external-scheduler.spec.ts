import { ExternalSourceError } from '../../application/ports/external-source-result.js';
import { ExternalScheduler } from './external-scheduler.js';

describe('Shared external scheduler', () => {
  const signal = () => new AbortController().signal;
  const policy = {
    maxConcurrentRequests: 1,
    maxQueuedRequests: 4,
    nvdMinIntervalMs: 1000,
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('spaces NVD starts while allowing KEV through the waiting queue', async () => {
    const scheduler = new ExternalScheduler(policy, () => Date.now());
    const calls: string[] = [];
    await scheduler.schedule('NVD', 5000, signal(), async () => {
      calls.push('nvd1');
    });
    const next = scheduler.schedule('NVD', 5000, signal(), async () => {
      calls.push('nvd2');
    });
    await scheduler.schedule('KEV', 5000, signal(), async () => {
      calls.push('kev');
    });
    expect(calls).toEqual(['nvd1', 'kev']);
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toEqual(['nvd1', 'kev']);
    await vi.advanceTimersByTimeAsync(1);
    await next;
    expect(calls).toEqual(['nvd1', 'kev', 'nvd2']);
  });

  it('bounds the queue and removes a cancelled waiting request', async () => {
    const scheduler = new ExternalScheduler(
      { ...policy, maxQueuedRequests: 1 },
      () => Date.now(),
    );
    let release: (() => void) | undefined;
    const first = scheduler.schedule(
      'KEV',
      5000,
      signal(),
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const waitingController = new AbortController();
    const waitingOperation = vi.fn(async () => undefined);
    const waiting = scheduler.schedule(
      'KEV',
      5000,
      waitingController.signal,
      waitingOperation,
    );
    const cancelled = expect(waiting).rejects.toMatchObject({
      name: 'AbortError',
    });
    await expect(
      scheduler.schedule('KEV', 5000, signal(), async () => undefined),
    ).rejects.toMatchObject({ kind: 'QUEUE_FULL' });
    waitingController.abort();
    await cancelled;
    const replacement = scheduler.schedule(
      'KEV',
      5000,
      signal(),
      async () => 'done',
    );
    release?.();
    await first;
    await expect(replacement).resolves.toBe('done');
    expect(waitingOperation).not.toHaveBeenCalled();
  });

  it('allows KEV to use a free slot while a full pending queue waits for NVD', async () => {
    const scheduler = new ExternalScheduler(
      { ...policy, maxQueuedRequests: 1 },
      () => Date.now(),
    );
    await scheduler.schedule('NVD', 5000, signal(), async () => undefined);
    await vi.advanceTimersByTimeAsync(0);
    const pending = scheduler.schedule(
      'NVD',
      5000,
      signal(),
      async () => 'nvd',
    );
    await expect(
      scheduler.schedule('NVD', 5000, signal(), async () => undefined),
    ).rejects.toMatchObject({ kind: 'QUEUE_FULL' });
    await expect(
      scheduler.schedule('KEV', 5000, signal(), async () => 'kev'),
    ).resolves.toBe('kev');
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBe('nvd');
  });

  it('expires queued work without starting it', async () => {
    const scheduler = new ExternalScheduler(policy, () => Date.now());
    let release: (() => void) | undefined;
    const first = scheduler.schedule(
      'KEV',
      5000,
      signal(),
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const operation = vi.fn(async () => undefined);
    const pending = scheduler.schedule('KEV', 300, signal(), operation);
    const expected = expect(pending).rejects.toMatchObject({ kind: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(300);
    await expected;
    release?.();
    await first;
    expect(operation).not.toHaveBeenCalled();
  });

  it('counts failed starts and respects provider Retry-After without blocking KEV', async () => {
    const scheduler = new ExternalScheduler(policy, () => Date.now());
    await expect(
      scheduler.schedule('NVD', 10000, signal(), async () => {
        throw new ExternalSourceError('UNAVAILABLE', 5000);
      }),
    ).rejects.toMatchObject({ kind: 'UNAVAILABLE' });
    const nvd = vi.fn(async () => undefined);
    await expect(
      scheduler.schedule('NVD', 4000, signal(), nvd),
    ).rejects.toMatchObject({ kind: 'TIMEOUT' });
    await expect(
      scheduler.schedule('KEV', 4000, signal(), async () => 'ok'),
    ).resolves.toBe('ok');
    expect(nvd).not.toHaveBeenCalled();
  });

  it('enforces the NVD interval even when a call fails without Retry-After', async () => {
    const scheduler = new ExternalScheduler(policy, () => Date.now());
    await expect(
      scheduler.schedule('NVD', 5000, signal(), async () => {
        throw new ExternalSourceError('UNAVAILABLE');
      }),
    ).rejects.toBeInstanceOf(ExternalSourceError);
    const second = vi.fn(async () => undefined);
    const pending = scheduler.schedule('NVD', 5000, signal(), second);
    await vi.advanceTimersByTimeAsync(999);
    expect(second).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('uses the permitted concurrency and starts queued work after a slot frees', async () => {
    const scheduler = new ExternalScheduler(
      { ...policy, maxConcurrentRequests: 2 },
      () => Date.now(),
    );
    const releases: Array<() => void> = [];
    const work = () =>
      new Promise<void>((resolve) => {
        releases.push(resolve);
      });
    const first = scheduler.schedule('KEV', 5000, signal(), work);
    const second = scheduler.schedule('KEV', 5000, signal(), work);
    const third = scheduler.schedule('KEV', 5000, signal(), work);
    expect(releases).toHaveLength(2);
    releases[0]();
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(releases).toHaveLength(3);
    releases[1]();
    releases[2]();
    await Promise.all([second, third]);
  });
});
