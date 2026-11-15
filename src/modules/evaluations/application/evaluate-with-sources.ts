import { performance } from 'node:perf_hooks';
import type { ExternalSourcesConfig } from '../../../config/external-sources.config.js';
import type { EvaluationInput } from '../domain/evaluation-input.js';
import type { CpeDictionaryCandidate } from './ports/cpe-dictionary.js';
import { ExternalSourceError } from './ports/external-source-result.js';
import type { SourcedValue } from './ports/external-source-result.js';
import { EvaluateBasic } from './evaluate-basic.js';

type BasicResult = ReturnType<EvaluateBasic['execute']>;
export type EvaluationResult = Omit<BasicResult, 'sources'> & {
  readonly sources: {
    readonly nvd: 'NOT_QUERIED' | 'AVAILABLE' | 'UNAVAILABLE';
    readonly kev: 'NOT_QUERIED';
    readonly checkedAt: string | null;
  };
};

interface CpeSearch {
  searchCpe(
    identification: NonNullable<EvaluationInput['identification']>,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<SourcedValue<readonly CpeDictionaryCandidate[]>>;
}

/** A complete dictionary lookup is evidence of candidates, never product identity. */
export class EvaluateWithSources {
  constructor(
    private readonly basic: EvaluateBasic,
    private readonly source: CpeSearch,
    private readonly config: Pick<
      ExternalSourcesConfig,
      'enabled' | 'evaluationBudgetMs'
    >,
    private readonly monotonicNow: () => number = () => performance.now(),
    private readonly wallNow: () => Date = () => new Date(),
  ) {}

  async execute(
    input: EvaluationInput,
    clientSignal: AbortSignal,
  ): Promise<EvaluationResult> {
    clientSignal.throwIfAborted();
    const deadlineAt = this.monotonicNow() + this.config.evaluationBudgetMs;
    const basic = this.basic.execute(input);
    if (!this.config.enabled || input.identification === undefined)
      return basic;

    const budget = new AbortController();
    const timeout = setTimeout(
      () => budget.abort(new ExternalSourceError('TIMEOUT')),
      Math.max(0, deadlineAt - this.monotonicNow()),
    );
    const signal = AbortSignal.any([clientSignal, budget.signal]);
    const attemptedAt = this.wallNow();
    try {
      const result = await this.source.searchCpe(
        input.identification,
        signal,
        deadlineAt,
      );
      signal.throwIfAborted();
      if (this.monotonicNow() >= deadlineAt)
        throw new ExternalSourceError('TIMEOUT');
      // The public input is a user declaration, not independent evidence that
      // uniquely identifies any returned CPE. Do not infer CVEs from it.
      return {
        ...basic,
        sources: {
          nvd: 'AVAILABLE',
          kev: 'NOT_QUERIED',
          checkedAt: result.obtainedAt.toISOString(),
        },
      };
    } catch (error) {
      clientSignal.throwIfAborted();
      if (!(error instanceof ExternalSourceError)) throw error;
      return {
        ...basic,
        sources: {
          nvd: 'UNAVAILABLE',
          kev: 'NOT_QUERIED',
          checkedAt: attemptedAt.toISOString(),
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
