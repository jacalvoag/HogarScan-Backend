/** Expected failures at the external boundary; messages never contain provider data. */
export class ExternalSourceError extends Error {
  constructor(
    readonly kind:
      'UNAVAILABLE' | 'TIMEOUT' | 'QUEUE_FULL' | 'INVALID_RESPONSE',
    readonly retryAfterMs?: number,
  ) {
    super('External source unavailable');
    this.name = 'ExternalSourceError';
  }
}

/** The original acquisition time must survive cache reads. */
export interface SourcedValue<T> {
  readonly value: T;
  readonly obtainedAt: Date;
}
