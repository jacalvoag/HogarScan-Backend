import { assessNvdApplicability } from './assess-nvd-applicability.js';
import type { MatchNvdCriterion } from './assess-nvd-applicability.js';
import type {
  NvdCandidate,
  NvdMatchCriterion,
} from './ports/vulnerability-sources.js';

describe('NVD applicability assessment', () => {
  const product: NvdMatchCriterion = {
    vulnerable: true,
    criteria: 'product',
    matchCriteriaId: 'product-id',
  };
  const environment: NvdMatchCriterion = {
    vulnerable: false,
    criteria: 'environment',
    matchCriteriaId: 'environment-id',
  };
  const candidate: NvdCandidate = {
    cve: 'CVE-2026-1234',
    status: 'Analyzed',
    hasUnparsedAffectedData: false,
    configurations: [
      {
        operator: 'AND',
        nodes: [
          { operator: 'OR', cpeMatch: [product] },
          { operator: 'OR', cpeMatch: [environment] },
        ],
      },
    ],
  };
  const evaluate = (
    productState: 'TRUE' | 'FALSE' | 'UNKNOWN',
    environmentState: 'TRUE' | 'FALSE' | 'UNKNOWN',
  ) => {
    const matcher: MatchNvdCriterion = (criterion) =>
      criterion.vulnerable ? productState : environmentState;
    return assessNvdApplicability(candidate, matcher);
  };

  it('requires both the vulnerable product and its environmental condition', () => {
    expect(evaluate('TRUE', 'TRUE')).toEqual({
      state: 'POSSIBLE',
      matchedCriteria: ['product-id'],
    });
    expect(evaluate('TRUE', 'UNKNOWN')).toEqual({ state: 'INCONCLUSIVE' });
    expect(evaluate('TRUE', 'FALSE')).toEqual({ state: 'NOT_SATISFIED' });
    expect(evaluate('FALSE', 'TRUE')).toEqual({ state: 'NOT_SATISFIED' });
  });

  it('does not treat a matching non-vulnerable prerequisite as a vulnerable product', () => {
    const input = {
      ...candidate,
      configurations: [
        { nodes: [{ operator: 'OR' as const, cpeMatch: [environment] }] },
      ],
    };
    expect(assessNvdApplicability(input, () => 'TRUE')).toEqual({
      state: 'INCONCLUSIVE',
    });
  });

  it('accepts a supported alternative only with a positive vulnerable match', () => {
    const input = {
      ...candidate,
      configurations: [
        { nodes: [{ operator: 'OR' as const, cpeMatch: [product] }] },
        { nodes: [{ operator: 'OR' as const, cpeMatch: [environment] }] },
      ],
    };
    expect(assessNvdApplicability(input, () => 'TRUE')).toEqual({
      state: 'POSSIBLE',
      matchedCriteria: ['product-id'],
    });
    expect(
      assessNvdApplicability(input, (criterion) =>
        criterion.vulnerable ? 'UNKNOWN' : 'TRUE',
      ),
    ).toEqual({ state: 'INCONCLUSIVE' });
  });

  it('does not use negated criteria as evidence of a vulnerable product', () => {
    const input = {
      ...candidate,
      configurations: [
        {
          nodes: [
            { operator: 'OR' as const, negate: true, cpeMatch: [product] },
          ],
        },
      ],
    };
    expect(assessNvdApplicability(input, () => 'FALSE')).toEqual({
      state: 'INCONCLUSIVE',
    });
    expect(assessNvdApplicability(input, () => 'UNKNOWN')).toEqual({
      state: 'INCONCLUSIVE',
    });
    expect(assessNvdApplicability(input, () => 'TRUE')).toEqual({
      state: 'NOT_SATISFIED',
    });
  });

  it.each([
    { ...candidate, configurations: null },
    { ...candidate, configurations: [] },
    { ...candidate, status: null },
    { ...candidate, status: 'Rejected' },
    { ...candidate, hasUnparsedAffectedData: true },
    { ...candidate, configurations: [{ nodes: [] }] },
    {
      ...candidate,
      configurations: [{ nodes: [{ operator: 'OR' as const, cpeMatch: [] }] }],
    },
    {
      ...candidate,
      configurations: [
        {
          nodes: [
            { operator: 'OR' as const, cpeMatch: [product] },
            { operator: 'OR' as const, cpeMatch: [environment] },
          ],
        },
      ],
    },
  ])(
    'does not infer applicability from incomplete or unsupported data %#',
    (input) => {
      expect(assessNvdApplicability(input, () => 'TRUE')).toEqual({
        state: 'INCONCLUSIVE',
      });
    },
  );
});
