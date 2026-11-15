import type { ProductIdentification } from '../domain/product-identification.js';
import type { CpeDictionaryCandidate } from './ports/cpe-dictionary.js';

const simpleToken = /^[a-zA-Z0-9][a-zA-Z0-9._-]*(?![\s\S])/;

/** Builds a dictionary filter across CPE parts, not a product identifier. */
export function createCpeDictionaryFilter(
  identification: ProductIdentification,
): string | undefined {
  const { vendor, product, version } = identification;
  if (![vendor, product, version].every((value) => simpleToken.test(value)))
    return undefined;
  return `cpe:2.3:*:${vendor}:${product}:${version}`;
}

/** Grants a provisional association only for an unambiguous dictionary record. */
export function resolveDeclaredCpe(
  identification: ProductIdentification,
  candidates: readonly CpeDictionaryCandidate[],
): string | undefined {
  if (candidates.length !== 1) return undefined;
  const [candidate] = candidates;
  if (candidate.deprecated) return undefined;

  const [prefix, format, part, vendor, product, version, ...qualifiers] =
    candidate.name.split(':');
  if (
    prefix !== 'cpe' ||
    format !== '2.3' ||
    !['a', 'o', 'h'].includes(part) ||
    ![vendor, product, version].every((value) => simpleToken.test(value)) ||
    vendor.toLowerCase() !== identification.vendor.toLowerCase() ||
    product.toLowerCase() !== identification.product.toLowerCase() ||
    version !== identification.version ||
    qualifiers.length !== 7 ||
    qualifiers.some((qualifier) => qualifier !== '*')
  ) {
    return undefined;
  }
  return candidate.name;
}
