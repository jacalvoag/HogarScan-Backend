import { performance } from 'node:perf_hooks';
import type { ExternalSourcesConfig } from '../../../config/external-sources.config.js';
import type { EvaluationInput } from '../domain/evaluation-input.js';
import type { ProductIdentification } from '../domain/product-identification.js';
import { createFinding } from '../domain/finding.js';
import type { CpeDictionaryCandidate } from './ports/cpe-dictionary.js';
import type {
  KevCatalog,
  NvdCandidate,
} from './ports/vulnerability-sources.js';
import { ExternalSourceError } from './ports/external-source-result.js';
import type { SourcedValue } from './ports/external-source-result.js';
import { EvaluateBasic } from './evaluate-basic.js';
import { assessNvdApplicability } from './assess-nvd-applicability.js';
import { compareNvdCriterionToCpe } from './compare-cpe-names.js';
import {
  createCpeDictionaryFilter,
  resolveDeclaredCpe,
} from './resolve-declared-cpe.js';

type BasicResult = ReturnType<EvaluateBasic['execute']>;
type SourceState = 'NOT_QUERIED' | 'AVAILABLE' | 'UNAVAILABLE';
interface PossibleCveMatch {
  readonly cve: string;
  readonly identification: ProductIdentification;
  readonly affectedCondition: string;
  readonly nvdCheckedAt: Date;
  readonly inKev: boolean | null;
}

export type EvaluationResult = Omit<
  BasicResult,
  'sources' | 'possibleCveMatches'
> & {
  readonly sources: {
    readonly nvd: SourceState;
    readonly kev: SourceState;
    readonly checkedAt: string | null;
  };
  readonly possibleCveMatches: readonly PossibleCveMatch[];
};

interface EvaluationSources {
  searchCpe(
    matchString: string,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<SourcedValue<readonly CpeDictionaryCandidate[]>>;
  searchCve(
    cpeName: string,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<SourcedValue<readonly NvdCandidate[]>>;
  loadKev(
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<SourcedValue<KevCatalog>>;
}

function oldest(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}

function findSupportedMatches(
  result: SourcedValue<readonly NvdCandidate[]>,
  cpeName: string,
  identification: ProductIdentification,
): PossibleCveMatch[] {
  const matches: PossibleCveMatch[] = [];
  for (const candidate of result.value) {
    const assessment = assessNvdApplicability(candidate, (criterion) =>
      // A mismatch with this CPE does not establish absence from the device.
      // Preserving UNKNOWN also prevents negation from turning it into proof.
      compareNvdCriterionToCpe(criterion, cpeName) === 'TRUE'
        ? 'TRUE'
        : 'UNKNOWN',
    );
    if (assessment.state === 'POSSIBLE') {
      matches.push({
        cve: candidate.cve,
        identification,
        affectedCondition: `La versión declarada coincide con la configuración publicada para ${cpeName}. Criterio vulnerable NVD: ${assessment.matchedCriteria[0]}.`,
        nvdCheckedAt: result.obtainedAt,
        inKev: null,
      });
    }
  }
  return matches;
}

export class EvaluateWithSources {
  constructor(
    private readonly basic: EvaluateBasic,
    private readonly source: EvaluationSources,
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
    const identification = input.identification;
    if (!this.config.enabled || identification === undefined) return basic;
    const matchString = createCpeDictionaryFilter(identification);
    if (matchString === undefined) return basic;

    const budget = new AbortController();
    const timeout = setTimeout(
      () => budget.abort(new ExternalSourceError('TIMEOUT')),
      Math.max(0, deadlineAt - this.monotonicNow()),
    );
    const signal = AbortSignal.any([clientSignal, budget.signal]);
    const ensureActive = () => {
      signal.throwIfAborted();
      if (this.monotonicNow() >= deadlineAt)
        throw new ExternalSourceError('TIMEOUT');
    };
    let checkedAt = this.wallNow();
    try {
      ensureActive();
      const dictionary = await this.source.searchCpe(
        matchString,
        signal,
        deadlineAt,
      );
      checkedAt = dictionary.obtainedAt;
      const cpeName = resolveDeclaredCpe(identification, dictionary.value);
      ensureActive();
      let matches: PossibleCveMatch[] = [];
      if (cpeName !== undefined) {
        const cves = await this.source.searchCve(cpeName, signal, deadlineAt);
        checkedAt = oldest(checkedAt, cves.obtainedAt);
        matches = findSupportedMatches(cves, cpeName, identification);
        ensureActive();
      }

      let kev: SourceState = 'NOT_QUERIED';
      if (matches.length > 0) {
        const attemptedKevAt = this.wallNow();
        try {
          const catalog = await this.source.loadKev(signal, deadlineAt);
          const enriched = matches.map((match) => ({
            ...match,
            inKev: catalog.value.contains(match.cve),
          }));
          ensureActive();
          matches = enriched;
          kev = 'AVAILABLE';
          checkedAt = oldest(checkedAt, catalog.obtainedAt);
        } catch (error) {
          clientSignal.throwIfAborted();
          if (!(error instanceof ExternalSourceError)) throw error;
          kev = 'UNAVAILABLE';
          checkedAt = oldest(checkedAt, attemptedKevAt);
        }
      }

      return {
        ...basic,
        sources: { nvd: 'AVAILABLE', kev, checkedAt: checkedAt.toISOString() },
        possibleCveMatches: matches,
        findings: [
          ...basic.findings,
          ...matches.map(({ cve, affectedCondition }) =>
            createFinding({
              category: 'POSSIBLE_CVE_MATCH',
              title: `Posible coincidencia con ${cve}`,
              priority: 'UNDETERMINED',
              confidence: 'POSSIBLE',
              evidence: affectedCondition,
              explanation:
                'NVD publica una condición compatible con la identificación declarada.',
              action:
                'Contrastar el modelo y la versión con el aviso del fabricante y revisar si hay una actualización.',
              limitation:
                'La identificación es declarada y la coincidencia no confirma que el dispositivo sea vulnerable.',
              ruleId: 'NVD_POSSIBLE_MATCH',
              cve,
            }),
          ),
        ],
      };
    } catch (error) {
      clientSignal.throwIfAborted();
      if (!(error instanceof ExternalSourceError)) throw error;
      return {
        ...basic,
        sources: {
          nvd: 'UNAVAILABLE',
          kev: 'NOT_QUERIED',
          checkedAt: checkedAt.toISOString(),
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
