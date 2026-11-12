import { EvaluateBasic } from '../application/evaluate-basic.js';
import {
  toEvaluationInput,
  toEvaluationResponse,
} from './evaluation.mapper.js';
import { evaluationSchema } from './evaluation.schema.js';

describe('Evaluation HTTP mapping', () => {
  it('maps contract names and evidence to domain and back to response fields', () => {
    const body = evaluationSchema.parse({
      probes: [
        {
          port: 80,
          outcome: 'ACCEPTED',
          protocol: 'HTTP',
          evidence_kind: 'HTTP_RESPONSE',
        },
        { port: 22, outcome: 'TIMEOUT' },
      ],
    });
    const input = toEvaluationInput(body);
    expect(input.observations[0]).toEqual({
      port: 80,
      outcome: 'ACCEPTED',
      protocol: 'HTTP',
      evidenceKind: 'HTTP_RESPONSE',
    });
    const result = new EvaluateBasic(
      () => new Date('2026-11-11T00:00:00Z'),
    ).execute(input);
    const response = toEvaluationResponse(result);
    expect(response).toMatchObject({
      ruleset_version: '0.1.0',
      evaluated_at: '2026-11-11T00:00:00.000Z',
      sources: { nvd: 'NOT_QUERIED', kev: 'NOT_QUERIED', checked_at: null },
      possible_cve_matches: [],
    });
    expect(response.findings[0]).toHaveProperty('rule_id', 'TCP_ACCEPTED');
    expect(response.findings[0]).not.toHaveProperty('ruleId');
  });
});
