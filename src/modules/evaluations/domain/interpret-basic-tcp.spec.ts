import { BASIC_RULESET_VERSION } from './basic-rules.js';
import { interpretBasicTcp } from './interpret-basic-tcp.js';
import type { EvaluationInput } from './evaluation-input.js';

describe('Basic TCP interpretation', () => {
  it('is deterministic, preserves observation order and never invents CVEs', () => {
    const input: EvaluationInput = {
      observations: [
        { port: 22, outcome: 'TIMEOUT' },
        { port: 80, outcome: 'ACCEPTED' },
        { port: 443, outcome: 'REFUSED' },
        { port: 445, outcome: 'ERROR' },
      ],
      identification: {
        vendor: 'Example',
        product: 'Router',
        version: '1.0',
        source: 'USER_DEVICE_LABEL',
      },
    };
    const first = interpretBasicTcp(input);
    expect(interpretBasicTcp(input)).toEqual(first);
    expect(first.findings.map((finding) => finding.ruleId)).toEqual([
      'TCP_TIMEOUT',
      'TCP_ACCEPTED',
      'TCP_REFUSED',
      'TCP_ERROR',
    ]);
    expect(first.findings.every((finding) => finding.cve === null)).toBe(true);
    expect(
      first.findings.every(
        (finding) =>
          finding.explanation.length > 0 &&
          finding.action.length > 0 &&
          finding.limitation.length > 0,
      ),
    ).toBe(true);
  });

  it.each([
    ['REFUSED', 'TCP_REFUSED', 'rechazado'],
    ['TIMEOUT', 'TCP_TIMEOUT', 'tiempo de espera'],
    ['ERROR', 'TCP_ERROR', 'error'],
  ] as const)('keeps %s distinct and inconclusive', (outcome, ruleId, text) => {
    const result = interpretBasicTcp({ observations: [{ port: 22, outcome }] });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      category: 'INSUFFICIENT_EVIDENCE',
      confidence: 'INCONCLUSIVE',
      priority: 'UNDETERMINED',
      ruleId,
      cve: null,
    });
    expect(result.findings[0]?.evidence).toContain(text);
  });

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
