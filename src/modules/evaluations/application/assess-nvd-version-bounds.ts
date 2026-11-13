import { combineApplicability } from './applicability-logic.js';
import type { ApplicabilityTruth } from './applicability-logic.js';
import type { NvdMatchCriterion } from './ports/vulnerability-sources.js';

/** Comparison is supplied only when the version scheme is known to the caller. */
export type CompareVersions = (
  version: string,
  boundary: string,
) => 'LESS' | 'EQUAL' | 'GREATER' | 'UNKNOWN';

/** Evaluates range bounds only, not product identity or the CPE version field. */
export function assessNvdVersionBounds(
  version: string,
  criterion: NvdMatchCriterion,
  compare: CompareVersions,
): ApplicabilityTruth {
  const {
    versionStartIncluding,
    versionStartExcluding,
    versionEndIncluding,
    versionEndExcluding,
  } = criterion;
  if (
    !version.trim() ||
    (versionStartIncluding !== undefined &&
      versionStartExcluding !== undefined) ||
    (versionEndIncluding !== undefined && versionEndExcluding !== undefined)
  )
    return 'UNKNOWN';

  const start = versionStartIncluding ?? versionStartExcluding;
  const end = versionEndIncluding ?? versionEndExcluding;
  if (start !== undefined && end !== undefined) {
    if (!start.trim() || !end.trim()) return 'UNKNOWN';
    const relation = compare(start, end);
    if (
      relation === 'UNKNOWN' ||
      relation === 'GREATER' ||
      (relation === 'EQUAL' &&
        (versionStartExcluding !== undefined ||
          versionEndExcluding !== undefined))
    ) {
      return 'UNKNOWN';
    }
  }

  const bounds: ApplicabilityTruth[] = [];
  const check = (
    boundary: string | undefined,
    accepted: readonly ('LESS' | 'EQUAL' | 'GREATER')[],
  ) => {
    if (boundary === undefined) return;
    if (!boundary.trim()) {
      bounds.push('UNKNOWN');
      return;
    }
    const order = compare(version, boundary);
    bounds.push(
      order === 'UNKNOWN'
        ? 'UNKNOWN'
        : accepted.includes(order)
          ? 'TRUE'
          : 'FALSE',
    );
  };
  check(versionStartIncluding, ['EQUAL', 'GREATER']);
  check(versionStartExcluding, ['GREATER']);
  check(versionEndIncluding, ['LESS', 'EQUAL']);
  check(versionEndExcluding, ['LESS']);
  return combineApplicability('AND', bounds);
}
