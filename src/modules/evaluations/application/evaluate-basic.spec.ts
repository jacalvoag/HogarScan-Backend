import { EvaluateBasic } from './evaluate-basic.js';

describe('EvaluateBasic', () => {
  it('composes deterministic interpretation and unqueried sources', () => {
    const date = new Date('2026-11-11T00:00:00.000Z');
    const evaluate = new EvaluateBasic(() => date);
    const result = evaluate.execute({
      observations: [{ port: 22, outcome: 'TIMEOUT' }],
    });
    expect(result).toMatchObject({
      rulesetVersion: '0.1.0',
      evaluatedAt: date,
      sources: { nvd: 'NOT_QUERIED', kev: 'NOT_QUERIED', checkedAt: null },
      possibleCveMatches: [],
      findings: [{ ruleId: 'TCP_TIMEOUT', cve: null }],
    });
  });
});
