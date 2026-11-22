import type { CompareVersions } from './assess-nvd-version-bounds.js';

interface SemanticVersion {
  readonly core: readonly bigint[];
  readonly prerelease: readonly string[] | null;
}

/** A conservative size bound prevents unbounded work on external values. */
const MAX_VERSION_LENGTH = 128;
const semverPattern =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?![\s\S])/;
const digits = /^[0-9]+(?![\s\S])/;

function parseSemver(value: string): SemanticVersion | null {
  if (value.length > MAX_VERSION_LENGTH) return null;
  const match = semverPattern.exec(value);
  if (match === null) return null;
  const prerelease = match[4] === undefined ? null : match[4].split('.');
  if (
    prerelease?.some(
      (part) => digits.test(part) && part.length > 1 && part.startsWith('0'),
    )
  )
    return null;
  return {
    core: [BigInt(match[1]), BigInt(match[2]), BigInt(match[3])],
    prerelease,
  };
}

function orderNumbers(
  left: bigint,
  right: bigint,
): 'LESS' | 'EQUAL' | 'GREATER' {
  return left < right ? 'LESS' : left > right ? 'GREATER' : 'EQUAL';
}

/** Use only when both version strings are known to follow SemVer 2.0.0. */
export const compareSemver: CompareVersions = (version, boundary) => {
  const left = parseSemver(version);
  const right = parseSemver(boundary);
  if (left === null || right === null) return 'UNKNOWN';
  for (let index = 0; index < 3; index++) {
    const result = orderNumbers(left.core[index], right.core[index]);
    if (result !== 'EQUAL') return result;
  }

  if (left.prerelease === null && right.prerelease === null) return 'EQUAL';
  if (left.prerelease === null) return 'GREATER';
  if (right.prerelease === null) return 'LESS';
  for (
    let index = 0;
    index < Math.max(left.prerelease.length, right.prerelease.length);
    index++
  ) {
    const a = left.prerelease[index];
    const b = right.prerelease[index];
    if (a === undefined) return 'LESS';
    if (b === undefined) return 'GREATER';
    if (a === b) continue;
    const numericA = digits.test(a);
    const numericB = digits.test(b);
    if (numericA && numericB) return orderNumbers(BigInt(a), BigInt(b));
    if (numericA !== numericB) return numericA ? 'LESS' : 'GREATER';
    return a < b ? 'LESS' : 'GREATER';
  }
  return 'EQUAL';
};
