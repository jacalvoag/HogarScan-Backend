import { BASIC_RULE_IDS, EVALUATION_RULESET_VERSION } from './basic-rules.js';

describe('Basic rule identifiers', () => {
  it('provides a version and unique stable identifiers', () => {
    expect(EVALUATION_RULESET_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    const ids = Object.values(BASIC_RULE_IDS);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(ids.length);
    expect(BASIC_RULE_IDS.accepted).toBe('TCP_ACCEPTED');
  });
});
