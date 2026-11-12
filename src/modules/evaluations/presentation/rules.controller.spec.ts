import { RulesController } from './rules.controller.js';
import { BASIC_RULESET_VERSION } from '../domain/basic-rules.js';

describe('RulesController', () => {
  it('returns stable public metadata consistent with the basic ruleset', () => {
    const controller = new RulesController();
    const metadata = controller.getRules();
    expect(controller.getRules()).toEqual(metadata);
    expect(metadata).toMatchObject({
      ruleset_version: BASIC_RULESET_VERSION,
      published_at: '2026-11-11T05:32:32Z',
      max_probes_per_evaluation: 6,
      max_addresses_per_scan: 254,
      allowed_ports: [22, 23, 80, 443, 445, 3389],
    });
    expect(new Set(metadata.categories).size).toBe(5);
    expect(metadata.caveat).not.toBe('');
  });
});
