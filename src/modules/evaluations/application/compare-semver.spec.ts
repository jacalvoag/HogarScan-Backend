import { compareSemver } from './compare-semver.js';
import { assessNvdVersionBounds } from './assess-nvd-version-bounds.js';

describe('SemVer 2.0 comparison', () => {
  it('can evaluate NVD bounds only when a caller explicitly selects SemVer', () => {
    const criterion = {
      vulnerable: true,
      criteria: 'synthetic',
      matchCriteriaId: 'synthetic',
      versionStartIncluding: '1.2.0',
      versionEndExcluding: '2.0.0',
    };
    expect(assessNvdVersionBounds('1.9.0', criterion, compareSemver)).toBe(
      'TRUE',
    );
    expect(assessNvdVersionBounds('2.0.0', criterion, compareSemver)).toBe(
      'FALSE',
    );
    expect(assessNvdVersionBounds('firmware-2', criterion, compareSemver)).toBe(
      'UNKNOWN',
    );
  });

  it.each([
    ['1.9.0', '1.10.0', 'LESS'],
    ['2.0.0', '1.999.999', 'GREATER'],
    ['1.0.0-alpha', '1.0.0', 'LESS'],
    ['1.0.0-alpha', '1.0.0-alpha.1', 'LESS'],
    ['1.0.0-alpha.2', '1.0.0-alpha.11', 'LESS'],
    ['1.0.0-1', '1.0.0-alpha', 'LESS'],
    ['1.0.0-alpha', '1.0.0-Beta', 'GREATER'],
    ['1.0.0+001', '1.0.0+002', 'EQUAL'],
    ['999999999999999999999.0.0', '999999999999999999998.0.0', 'GREATER'],
  ] as const)(
    'compares %s and %s by SemVer precedence',
    (left, right, expected) => {
      expect(compareSemver(left, right)).toBe(expected);
    },
  );

  it.each([
    '',
    '1.2',
    'v1.2.3',
    '01.2.3',
    '1.02.3',
    '1.2.3-01',
    '1.2.3-',
    '1.2.3+',
    '1.2.3-alpha..1',
    '1.2.3\n',
    ' 1.2.3',
    '1.2.3-α',
    `${'1'.repeat(129)}.0.0`,
  ])('returns unknown for unsupported or invalid version %s', (version) => {
    expect(compareSemver(version, '1.2.3')).toBe('UNKNOWN');
    expect(compareSemver('1.2.3', version)).toBe('UNKNOWN');
  });
});
