import { interpretBasicTcp } from '../domain/interpret-basic-tcp.js';
import type { EvaluationInput } from '../domain/evaluation-input.js';

export class EvaluateBasic {
  constructor(private readonly now: () => Date = () => new Date()) {}

  execute(input: EvaluationInput) {
    const interpretation = interpretBasicTcp(input);
    return {
      rulesetVersion: interpretation.rulesetVersion,
      evaluatedAt: this.now(),
      sources: {
        nvd: 'NOT_QUERIED',
        kev: 'NOT_QUERIED',
        checkedAt: null,
      } as const,
      findings: interpretation.findings,
      possibleCveMatches: [],
    };
  }
}
