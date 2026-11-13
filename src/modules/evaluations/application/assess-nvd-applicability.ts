import { combineApplicability } from './applicability-logic.js';
import type { ApplicabilityTruth } from './applicability-logic.js';
import type {
  NvdCandidate,
  NvdConfiguration,
  NvdMatchCriterion,
} from './ports/vulnerability-sources.js';

/** The matcher must return UNKNOWN when product, version or environment cannot be established. */
export type MatchNvdCriterion = (
  criterion: NvdMatchCriterion,
) => ApplicabilityTruth;
export type NvdAssessment =
  | { readonly state: 'POSSIBLE'; readonly matchedCriteria: readonly string[] }
  | { readonly state: 'NOT_SATISFIED' | 'INCONCLUSIVE' };

interface EvaluatedGroup {
  readonly truth: ApplicabilityTruth;
  readonly vulnerableMatches: readonly string[];
}

function evaluateConfiguration(
  config: NvdConfiguration,
  match: MatchNvdCriterion,
): EvaluatedGroup {
  const nodes: EvaluatedGroup[] = config.nodes.map((node) => {
    const outcomes = node.cpeMatch.map((criterion) => ({
      criterion,
      truth: match(criterion),
    }));
    const truth = combineApplicability(
      node.operator,
      outcomes.map((item) => item.truth),
      node.negate,
    );
    return {
      truth,
      vulnerableMatches:
        truth === 'TRUE' && !node.negate
          ? outcomes
              .filter(
                (item) => item.truth === 'TRUE' && item.criterion.vulnerable,
              )
              .map((item) => item.criterion.matchCriteriaId)
          : [],
    };
  });

  if (config.operator === undefined && nodes.length !== 1)
    return { truth: 'UNKNOWN', vulnerableMatches: [] };
  const truth = combineApplicability(
    config.operator ?? 'AND',
    nodes.map((node) => node.truth),
    config.negate,
  );
  return {
    truth,
    vulnerableMatches:
      truth === 'TRUE' && !config.negate
        ? nodes
            .filter((node) => node.truth === 'TRUE')
            .flatMap((node) => node.vulnerableMatches)
        : [],
  };
}

/** Evaluates known conditions only; it does not fetch data or prove actual vulnerability. */
export function assessNvdApplicability(
  candidate: NvdCandidate,
  match: MatchNvdCriterion,
): NvdAssessment {
  if (
    candidate.status === null ||
    candidate.status.toLowerCase() === 'rejected' ||
    candidate.hasUnparsedAffectedData ||
    !candidate.configurations?.length
  ) {
    return { state: 'INCONCLUSIVE' };
  }

  const results = candidate.configurations.map((config) =>
    evaluateConfiguration(config, match),
  );
  const matchedCriteria = [
    ...new Set(
      results
        .filter((result) => result.truth === 'TRUE')
        .flatMap((result) => result.vulnerableMatches),
    ),
  ];
  if (matchedCriteria.length > 0) return { state: 'POSSIBLE', matchedCriteria };
  if (results.every((result) => result.truth === 'FALSE'))
    return { state: 'NOT_SATISFIED' };
  return { state: 'INCONCLUSIVE' };
}
