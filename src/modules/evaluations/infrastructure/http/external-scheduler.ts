import { performance } from 'node:perf_hooks';
import { ExternalSourceError } from '../../application/ports/external-source-result.js';

export type ExternalProvider = 'NVD' | 'KEV';
export interface SchedulerPolicy {
  readonly maxConcurrentRequests: number;
  readonly maxQueuedRequests: number;
  readonly nvdMinIntervalMs: number;
}

interface PendingWork {
  readonly provider: ExternalProvider;
  readonly deadlineAt: number;
  readonly signal: AbortSignal;
  readonly start: () => void;
  readonly reject: (reason: unknown) => void;
  readonly onAbort: () => void;
  readonly checkCache: () => boolean;
  readonly mayUseCache: boolean;
}

export type CachedResult<T> =
  { readonly hit: false } | { readonly hit: true; readonly value: T };

/** One process-wide scheduler must be shared by all requests and accounts. */
export class ExternalScheduler {
  private active = 0;
  private readonly queue: PendingWork[] = [];
  private nvdNextStart = 0;
  private readonly cooldown: Record<ExternalProvider, number> = {
    NVD: 0,
    KEV: 0,
  };
  private wakeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly policy: SchedulerPolicy,
    private readonly now: () => number = () => performance.now(),
  ) {}

  private eligibleAt(provider: ExternalProvider): number {
    return Math.max(
      this.cooldown[provider],
      provider === 'NVD' ? this.nvdNextStart : 0,
    );
  }

  schedule<T>(
    provider: ExternalProvider,
    deadlineAt: number,
    signal: AbortSignal,
    operation: (signal: AbortSignal, deadlineAt: number) => Promise<T>,
    checkCache?: () => CachedResult<T>,
  ): Promise<T> {
    if (signal.aborted) return Promise.reject(signal.reason);
    if (
      this.now() >= deadlineAt ||
      (checkCache === undefined && this.eligibleAt(provider) >= deadlineAt)
    )
      return Promise.reject(new ExternalSourceError('TIMEOUT'));
    // Start already-eligible queued work before deciding whether this call can start.
    this.drain();

    return new Promise<T>((resolve, reject) => {
      const work: PendingWork = {
        provider,
        deadlineAt,
        signal,
        mayUseCache: checkCache !== undefined,
        reject,
        checkCache: () => {
          if (checkCache === undefined) return false;
          try {
            const cached = checkCache();
            if (!cached.hit) return false;
            if (signal.aborted) reject(signal.reason);
            else if (this.now() >= deadlineAt)
              reject(new ExternalSourceError('TIMEOUT'));
            else resolve(cached.value);
          } catch (error) {
            reject(error);
          }
          return true;
        },
        onAbort: () => {
          const index = this.queue.indexOf(work);
          if (index >= 0) {
            this.queue.splice(index, 1);
            signal.removeEventListener('abort', work.onAbort);
            reject(signal.reason);
            this.drain();
          }
        },
        start: () => {
          signal.removeEventListener('abort', work.onAbort);
          if (signal.aborted) {
            reject(signal.reason);
            return;
          }
          if (this.now() >= deadlineAt) {
            reject(new ExternalSourceError('TIMEOUT'));
            return;
          }
          this.active++;
          if (provider === 'NVD')
            this.nvdNextStart = this.now() + this.policy.nvdMinIntervalMs;
          let running: Promise<T>;
          try {
            running = operation(signal, deadlineAt);
          } catch (error) {
            running = Promise.reject(error);
          }
          void running
            .then(
              (value) => {
                if (signal.aborted) reject(signal.reason);
                else if (this.now() >= deadlineAt)
                  reject(new ExternalSourceError('TIMEOUT'));
                else resolve(value);
              },
              (error: unknown) => {
                if (signal.aborted) {
                  reject(signal.reason);
                  return;
                }
                if (
                  error instanceof ExternalSourceError &&
                  error.retryAfterMs !== undefined
                ) {
                  this.cooldown[provider] = Math.max(
                    this.cooldown[provider],
                    this.now() + error.retryAfterMs,
                  );
                }
                reject(error);
              },
            )
            .finally(() => {
              this.active--;
              this.drain();
            });
        },
      };

      if (
        this.active < this.policy.maxConcurrentRequests &&
        this.eligibleAt(provider) <= this.now()
      ) {
        work.start();
      } else if (this.queue.length >= this.policy.maxQueuedRequests) {
        reject(new ExternalSourceError('QUEUE_FULL'));
      } else {
        this.queue.push(work);
        signal.addEventListener('abort', work.onAbort, { once: true });
        this.drain();
      }
    });
  }

  private drain(): void {
    if (this.wakeTimer !== undefined) {
      clearTimeout(this.wakeTimer);
      this.wakeTimer = undefined;
    }
    const now = this.now();
    for (let index = this.queue.length - 1; index >= 0; index--) {
      const work = this.queue[index];
      if (work.signal.aborted || work.deadlineAt <= now) {
        this.queue.splice(index, 1);
        work.signal.removeEventListener('abort', work.onAbort);
        work.reject(
          work.signal.aborted
            ? work.signal.reason
            : new ExternalSourceError('TIMEOUT'),
        );
      } else if (work.checkCache()) {
        this.queue.splice(index, 1);
        work.signal.removeEventListener('abort', work.onAbort);
      } else if (
        !work.mayUseCache &&
        this.eligibleAt(work.provider) >= work.deadlineAt
      ) {
        this.queue.splice(index, 1);
        work.signal.removeEventListener('abort', work.onAbort);
        work.reject(new ExternalSourceError('TIMEOUT'));
      }
    }

    while (this.active < this.policy.maxConcurrentRequests) {
      const index = this.queue.findIndex(
        (work) => this.eligibleAt(work.provider) <= this.now(),
      );
      if (index < 0) break;
      const [work] = this.queue.splice(index, 1);
      work.start();
    }

    if (this.queue.length > 0) {
      const wakeAt = Math.min(
        ...this.queue.map((work) =>
          this.active < this.policy.maxConcurrentRequests
            ? Math.min(work.deadlineAt, this.eligibleAt(work.provider))
            : work.deadlineAt,
        ),
      );
      this.wakeTimer = setTimeout(
        () => {
          this.wakeTimer = undefined;
          this.drain();
        },
        Math.max(0, wakeAt - this.now()),
      );
    }
  }
}
