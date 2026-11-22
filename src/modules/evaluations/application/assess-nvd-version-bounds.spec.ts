import { assessNvdVersionBounds } from './assess-nvd-version-bounds.js';
import type { CompareVersions } from './assess-nvd-version-bounds.js';
import type { NvdMatchCriterion } from './ports/vulnerability-sources.js';

describe('NVD version bounds', () => {
  const criterion: NvdMatchCriterion = {
    vulnerable: true,
    criteria: 'synthetic',
    matchCriteriaId: 'synthetic',
  };
  // An explicit order supplied only for this synthetic example; not a general version comparator.
  const order = ['v1', 'v2', 'v3'];
  const compare: CompareVersions = (version, boundary) => {
    const left = order.indexOf(version);
    const right = order.indexOf(boundary);
    if (left < 0 || right < 0) return 'UNKNOWN';
    return left < right ? 'LESS' : left > right ? 'GREATER' : 'EQUAL';
  };

  it.each([
    ['versionStartIncluding', 'v2', 'TRUE'],
    ['versionStartExcluding', 'v2', 'FALSE'],
    ['versionEndIncluding', 'v2', 'TRUE'],
    ['versionEndExcluding', 'v2', 'FALSE'],
  ] as const)(
    'handles the equality boundary for %s',
    (field, boundary, expected) => {
      expect(
        assessNvdVersionBounds(
          'v2',
          { ...criterion, [field]: boundary },
          compare,
        ),
      ).toBe(expected);
    },
  );

  it('requires every supported lower and upper bound', () => {
    const bounded = {
      ...criterion,
      versionStartIncluding: 'v1',
      versionEndExcluding: 'v3',
    };
    expect(assessNvdVersionBounds('v2', bounded, compare)).toBe('TRUE');
    expect(assessNvdVersionBounds('v3', bounded, compare)).toBe('FALSE');
  });

  it('keeps unrecognized versions, missing or contradictory bounds inconclusive', () => {
    expect(
      assessNvdVersionBounds(
        'unknown',
        { ...criterion, versionEndIncluding: 'v3' },
        compare,
      ),
    ).toBe('UNKNOWN');
    expect(assessNvdVersionBounds('v2', criterion, compare)).toBe('UNKNOWN');
    expect(
      assessNvdVersionBounds(
        'v2',
        {
          ...criterion,
          versionStartIncluding: 'v1',
          versionStartExcluding: 'v1',
        },
        compare,
      ),
    ).toBe('UNKNOWN');
    expect(
      assessNvdVersionBounds(
        'v2',
        {
          ...criterion,
          versionStartIncluding: 'v3',
          versionEndIncluding: 'v1',
        },
        compare,
      ),
    ).toBe('UNKNOWN');
    expect(
      assessNvdVersionBounds(
        'v2',
        {
          ...criterion,
          versionStartExcluding: 'v2',
          versionEndIncluding: 'v2',
        },
        compare,
      ),
    ).toBe('UNKNOWN');
    expect(
      assessNvdVersionBounds(
        ' ',
        { ...criterion, versionEndIncluding: 'v3' },
        compare,
      ),
    ).toBe('UNKNOWN');
  });
});
