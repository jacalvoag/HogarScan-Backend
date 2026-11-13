import { compareNvdCriterionToCpe } from './compare-cpe-names.js';
import { assessNvdApplicability } from './assess-nvd-applicability.js';
import type { CompareVersions } from './assess-nvd-version-bounds.js';
import type { NvdMatchCriterion } from './ports/vulnerability-sources.js';

describe('NVD criterion against one resolved CPE', () => {
  const criterion: NvdMatchCriterion = {
    vulnerable: true,
    criteria: 'cpe:2.3:h:example:router:*:*:*:*:*:*:*:*',
    matchCriteriaId: 'synthetic',
    versionStartIncluding: 'v1',
    versionEndExcluding: 'v3',
  };
  const target = 'cpe:2.3:h:example:router:v2:*:*:*:*:*:*:*';
  const order = ['v1', 'v2', 'v3'];
  const compare: CompareVersions = (a, b) => {
    const left = order.indexOf(a);
    const right = order.indexOf(b);
    return left < 0 || right < 0
      ? 'UNKNOWN'
      : left < right
        ? 'LESS'
        : left > right
          ? 'GREATER'
          : 'EQUAL';
  };

  it('requires both the CPE relation and known version bounds', () => {
    expect(compareNvdCriterionToCpe(criterion, target, compare)).toBe('TRUE');
    expect(
      compareNvdCriterionToCpe(
        criterion,
        target.replace(':v2:', ':v3:'),
        compare,
      ),
    ).toBe('FALSE');
    expect(
      compareNvdCriterionToCpe(
        criterion,
        target.replace(':example:', ':other:'),
        compare,
      ),
    ).toBe('FALSE');
  });

  it('does not guess version ordering or an unknown target version', () => {
    expect(compareNvdCriterionToCpe(criterion, target)).toBe('UNKNOWN');
    expect(
      compareNvdCriterionToCpe(
        criterion,
        target.replace(':v2:', ':*:'),
        compare,
      ),
    ).toBe('UNKNOWN');
    expect(
      compareNvdCriterionToCpe(
        criterion,
        target.replace(':v2:', ':unknown:'),
        compare,
      ),
    ).toBe('UNKNOWN');
  });

  it('does not substantiate a generic product or an unspecified version', () => {
    const unbounded: NvdMatchCriterion = {
      vulnerable: true,
      matchCriteriaId: 'synthetic',
      criteria: 'cpe:2.3:h:example:router:*:*:*:*:*:*:*:*',
    };
    expect(
      compareNvdCriterionToCpe(
        unbounded,
        'cpe:2.3:h:example:router:*:*:*:*:*:*:*:*',
      ),
    ).toBe('UNKNOWN');
    expect(
      compareNvdCriterionToCpe(unbounded, 'cpe:2.3:h:*:*:v2:*:*:*:*:*:*:*'),
    ).toBe('UNKNOWN');
    expect(
      compareNvdCriterionToCpe(
        { ...unbounded, criteria: 'cpe:2.3:h:*:*:*:*:*:*:*:*:*:*' },
        target,
      ),
    ).toBe('UNKNOWN');
  });

  it('compares unbounded criteria without inventing a version range', () => {
    const {
      versionStartIncluding: _start,
      versionEndExcluding: _end,
      ...unbounded
    } = criterion;
    expect(compareNvdCriterionToCpe(unbounded, target)).toBe('TRUE');
  });

  it('preserves target version spelling for the supplied comparator', () => {
    const compareExact = vi.fn<CompareVersions>().mockReturnValue('EQUAL');
    const bounded = { ...criterion, versionEndExcluding: undefined };
    expect(
      compareNvdCriterionToCpe(
        bounded,
        target.replace(':v2:', ':V2:'),
        compareExact,
      ),
    ).toBe('TRUE');
    expect(compareExact).toHaveBeenCalledWith('V2', 'v1');
  });

  it('does not assume case-only version differences are equivalent', () => {
    const exact: NvdMatchCriterion = {
      vulnerable: true,
      matchCriteriaId: 'synthetic',
      criteria: 'cpe:2.3:h:example:router:1.0.0-ALPHA:*:*:*:*:*:*:*',
    };
    expect(
      compareNvdCriterionToCpe(
        exact,
        'cpe:2.3:h:example:router:1.0.0-alpha:*:*:*:*:*:*:*',
      ),
    ).toBe('UNKNOWN');
  });

  it('keeps an unverified environment inconclusive even if the product matches', () => {
    const candidate = {
      cve: 'CVE-2026-1234',
      status: 'Analyzed',
      hasUnparsedAffectedData: false,
      configurations: [
        {
          operator: 'AND' as const,
          nodes: [
            { operator: 'OR' as const, cpeMatch: [criterion] },
            {
              operator: 'OR' as const,
              cpeMatch: [
                {
                  ...criterion,
                  vulnerable: false,
                  matchCriteriaId: 'environment',
                },
              ],
            },
          ],
        },
      ],
    };
    expect(
      assessNvdApplicability(candidate, (item) =>
        item.vulnerable
          ? compareNvdCriterionToCpe(item, target, compare)
          : 'UNKNOWN',
      ),
    ).toEqual({ state: 'INCONCLUSIVE' });
  });

  it('combines one resolved CPE with candidate assessment without inferring other products', () => {
    const candidate = {
      cve: 'CVE-2026-1234',
      status: 'Analyzed',
      hasUnparsedAffectedData: false,
      configurations: [
        { nodes: [{ operator: 'OR' as const, cpeMatch: [criterion] }] },
      ],
    };
    expect(
      assessNvdApplicability(candidate, (item) =>
        compareNvdCriterionToCpe(item, target, compare),
      ),
    ).toEqual({ state: 'POSSIBLE', matchedCriteria: ['synthetic'] });
    expect(
      assessNvdApplicability(candidate, (item) =>
        compareNvdCriterionToCpe(item, target),
      ),
    ).toEqual({ state: 'INCONCLUSIVE' });
  });
});
