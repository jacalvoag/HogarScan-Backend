import { BASIC_RULESET_VERSION } from './basic-rules.js';
import { interpretBasicTcp } from './interpret-basic-tcp.js';

describe('Basic TCP interpretation', () => {
  it.each([
    { protocol: 'HTTP', evidenceKind: 'HTTP_RESPONSE' },
    { protocol: 'HTTPS', evidenceKind: 'HTTPS_RESPONSE' },
    { protocol: 'SSH', evidenceKind: 'SSH_IDENTIFICATION' },
    { protocol: 'FTP', evidenceKind: 'FTP_GREETING' },
  ] as const)(
    'reports only the explicitly evidenced protocol: $protocol',
    (evidence) => {
      const result = interpretBasicTcp({
        observations: [{ port: 80, outcome: 'ACCEPTED', ...evidence }],
      });
      expect(result.findings).toHaveLength(2);
      expect(result.findings[1]).toMatchObject({
        category: 'PROTOCOL_IDENTIFIED',
        confidence: 'OBSERVED',
        priority: 'LOW',
        ruleId: 'PROTOCOL_IDENTIFIED',
        cve: null,
      });
      expect(result.findings[1]?.evidence).toContain(evidence.evidenceKind);
    },
  );

  it('reports an accepted connection without inferring a vulnerability', () => {
    const result = interpretBasicTcp({
      observations: [{ port: 80, outcome: 'ACCEPTED' }],
    });
    expect(result.rulesetVersion).toBe(BASIC_RULESET_VERSION);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      category: 'TCP_SERVICE_ACCESSIBLE',
      priority: 'LOW',
      confidence: 'OBSERVED',
      ruleId: 'TCP_ACCEPTED',
      cve: null,
    });
  });

  it('requires a valid collection of observations', () => {
    expect(() => interpretBasicTcp({ observations: [] })).toThrow(RangeError);
    expect(() =>
      interpretBasicTcp({
        observations: [
          { port: 22, outcome: 'ACCEPTED' },
          { port: 22, outcome: 'REFUSED' },
        ],
      }),
    ).toThrow('An evaluation cannot repeat a port');
  });
});
