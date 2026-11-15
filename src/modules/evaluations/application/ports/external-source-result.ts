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

export class InvalidExternalPayloadError extends ExternalSourceError {
  constructor(source: 'NVD' | 'CPE' | 'KEV') {
    super('INVALID_RESPONSE');
    this.name = 'InvalidExternalPayloadError';
    this.message =
      source === 'NVD'
        ? 'Invalid NVD response'
        : source === 'CPE'
          ? 'Invalid CPE dictionary response'
          : 'Invalid KEV catalog';
  }
}

/** The original acquisition time must survive cache reads. */
export interface SourcedValue<T> {
  readonly value: T;
  readonly obtainedAt: Date;
}
