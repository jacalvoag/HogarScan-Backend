/** UNKNOWN means that the available evidence cannot settle a condition. */
export type ApplicabilityTruth = 'TRUE' | 'FALSE' | 'UNKNOWN';
export type ApplicabilityOperator = 'AND' | 'OR';

/** Combine nonempty conditions conservatively; an empty group is inconclusive. */
export function combineApplicability(
  operator: ApplicabilityOperator,
  values: readonly ApplicabilityTruth[],
  negate = false,
): ApplicabilityTruth {
  if (values.length === 0) return 'UNKNOWN';

  let result: ApplicabilityTruth;
  if (operator === 'AND') {
    result = values.includes('FALSE')
      ? 'FALSE'
      : values.includes('UNKNOWN')
        ? 'UNKNOWN'
        : 'TRUE';
  } else {
    result = values.includes('TRUE')
      ? 'TRUE'
      : values.includes('UNKNOWN')
        ? 'UNKNOWN'
        : 'FALSE';
  }

  if (!negate || result === 'UNKNOWN') return result;
  return result === 'TRUE' ? 'FALSE' : 'TRUE';
}
