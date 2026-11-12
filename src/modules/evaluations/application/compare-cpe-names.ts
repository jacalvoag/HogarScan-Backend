import { combineApplicability } from './applicability-logic.js';
import type { ApplicabilityTruth } from './applicability-logic.js';

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
  return attributes.map((attribute) => attribute.toLowerCase());
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
      return sourceValue === targetValue ? 'TRUE' : 'FALSE';
    },
  );
  return combineApplicability('AND', relations);
}
