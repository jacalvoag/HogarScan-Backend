import { parseNvdPage } from '../infrastructure/nvd/parse-nvd-page.js';
import { assessNvdApplicability } from './assess-nvd-applicability.js';
import { assessNvdVersionBounds } from './assess-nvd-version-bounds.js';
import type { CompareVersions } from './assess-nvd-version-bounds.js';
import type { ApplicabilityTruth } from './applicability-logic.js';
import type { NvdMatchCriterion } from './ports/vulnerability-sources.js';

describe('NVD assessment with synthetic data', () => {
  const payload = {
    resultsPerPage: 1,
    startIndex: 0,
    totalResults: 1,
    format: 'NVD_CVE',
    version: '2.0',
    timestamp: '2026-11-12T00:00:00.000',
    vulnerabilities: [
      {
        cve: {
          id: 'CVE-2026-1234',
          published: '2026-11-12T00:00:00.000',
          lastModified: '2026-11-12T00:00:00.000',
          descriptions: [{ lang: 'en', value: 'Synthetic' }],
          references: [],
          vulnStatus: 'Analyzed',
          configurations: [
            {
              operator: 'AND',
              nodes: [
                {
                  operator: 'OR',
                  cpeMatch: [
                    {
                      vulnerable: true,
                      criteria: 'synthetic-product',
                      matchCriteriaId: '00000000-0000-4000-8000-000000000001',
                      versionStartIncluding: 'v1',
                      versionEndExcluding: 'v3',
                    },
                  ],
                },
                {
                  operator: 'OR',
                  cpeMatch: [
                    {
                      vulnerable: false,
                      criteria: 'synthetic-environment',
                      matchCriteriaId: '00000000-0000-4000-8000-000000000002',
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  };
  const order = ['v1', 'v2', 'v3'];
  const compare: CompareVersions = (version, boundary) => {
    const a = order.indexOf(version);
    const b = order.indexOf(boundary);
    return a < 0 || b < 0
      ? 'UNKNOWN'
      : a < b
        ? 'LESS'
        : a > b
          ? 'GREATER'
          : 'EQUAL';
  };

  it.each([
    ['v2', 'TRUE', 'POSSIBLE'],
    ['v3', 'TRUE', 'NOT_SATISFIED'],
    ['unknown', 'TRUE', 'INCONCLUSIVE'],
    ['v2', 'UNKNOWN', 'INCONCLUSIVE'],
  ] as const)(
    'preserves the combined outcome for %s and environment %s',
    (version, environment, expected) => {
      const candidate = parseNvdPage(payload).candidates[0];
      expect(candidate).toBeDefined();
      if (!candidate) throw new Error('Missing synthetic candidate');
      const matcher = (criterion: NvdMatchCriterion): ApplicabilityTruth => {
        if (criterion.criteria === 'synthetic-environment') return environment;
        if (criterion.criteria === 'synthetic-product')
          return assessNvdVersionBounds(version, criterion, compare);
        return 'UNKNOWN';
      };
      expect(assessNvdApplicability(candidate, matcher).state).toBe(expected);
    },
  );
});
