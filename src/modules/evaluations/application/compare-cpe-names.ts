import { combineApplicability } from './applicability-logic.js';
import type { ApplicabilityTruth } from './applicability-logic.js';
import { assessNvdVersionBounds } from './assess-nvd-version-bounds.js';
import type { CompareVersions } from './assess-nvd-version-bounds.js';
import type { NvdMatchCriterion } from './ports/vulnerability-sources.js';

/** Supported subset: CPE 2.3 formatted names with literal values, ANY or NA. */
function parseSimpleCpe(value: string): readonly string[] | null {
  const parts = value.split(':');
  if (parts.length !== 13 || parts[0] !== 'cpe' || parts[1] !== '2.3')
    return null;
  const attributes = parts.slice(2);
  if (!['a', 'o', 'h', '*', '-'].includes(attributes[0]?.toLowerCase() ?? ''))
    return null;
  if (
    attributes.some(
      (attribute) =>
        attribute !== '*' && !/^[a-zA-Z0-9._-]+(?![\s\S])/.test(attribute),
    )
  )
    return null;
  const language = attributes[6];
  if (
    language !== '*' &&
    language !== '-' &&
    (language === undefined ||
      !/^[a-zA-Z]{2,3}(?:-(?:[a-zA-Z]{2}|[0-9]{3}))?(?![\s\S])/.test(language))
  )
    return null;
  return attributes;
}

/**
 * Compares one NVD criterion to one resolved CPE, not to an entire inventory.
 * Escapes, partial wildcards and unsupported syntax remain inconclusive.
 */
export function compareCpeNames(
  source: string,
  target: string,
): ApplicabilityTruth {
  const sourceAttributes = parseSimpleCpe(source);
  const targetAttributes = parseSimpleCpe(target);
  if (sourceAttributes === null || targetAttributes === null) return 'UNKNOWN';

  const relations = sourceAttributes.map(
    (sourceValue, index): ApplicabilityTruth => {
      const targetValue = targetAttributes[index];
      if (targetValue === undefined) return 'UNKNOWN';
      if (sourceValue === '*') return 'TRUE';
      if (targetValue === '*') return 'UNKNOWN';
      return sourceValue.toLowerCase() === targetValue.toLowerCase()
        ? 'TRUE'
        : 'FALSE';
    },
  );
  return combineApplicability('AND', relations);
}

/**
 * Compares a criterion to one independently resolved CPE. A FALSE result says
 * nothing about other products or prerequisites that were not inventoried.
 */
export function compareNvdCriterionToCpe(
  criterion: NvdMatchCriterion,
  resolvedCpe: string,
  compareVersions?: CompareVersions,
): ApplicabilityTruth {
  const source = parseSimpleCpe(criterion.criteria);
  const target = parseSimpleCpe(resolvedCpe);
  if (source === null || target === null) return 'UNKNOWN';
  // A generic CPE cannot substantiate the specifically declared product/version.
  if (
    [source[1], source[2], target[0], target[1], target[2], target[3]].some(
      (value) => value === undefined || value === '*' || value === '-',
    )
  )
    return 'UNKNOWN';
  const nameResult = compareCpeNames(criterion.criteria, resolvedCpe);
  if (nameResult !== 'TRUE') return nameResult;
  const hasBounds = [
    criterion.versionStartIncluding,
    criterion.versionStartExcluding,
    criterion.versionEndIncluding,
    criterion.versionEndExcluding,
  ].some((value) => value !== undefined);
  if (!hasBounds) return nameResult;

  const version = target[3];
  if (
    version === undefined ||
    version === '*' ||
    version === '-' ||
    compareVersions === undefined
  )
    return 'UNKNOWN';
  const bounds = assessNvdVersionBounds(version, criterion, compareVersions);
  return combineApplicability('AND', [nameResult, bounds]);
}
