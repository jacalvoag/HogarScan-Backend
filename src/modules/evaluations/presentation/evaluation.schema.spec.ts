import { evaluationSchema } from './evaluation.schema.js';

describe('Evaluation request schema', () => {
  it.each([
    {
      port: 80,
      outcome: 'ACCEPTED',
      protocol: 'HTTP',
      evidence_kind: 'HTTP_RESPONSE',
    },
    {
      port: 443,
      outcome: 'ACCEPTED',
      protocol: 'HTTPS',
      evidence_kind: 'HTTPS_RESPONSE',
    },
    {
      port: 22,
      outcome: 'ACCEPTED',
      protocol: 'SSH',
      evidence_kind: 'SSH_IDENTIFICATION',
    },
    {
      port: 23,
      outcome: 'ACCEPTED',
      protocol: 'FTP',
      evidence_kind: 'FTP_GREETING',
    },
    { port: 445, outcome: 'REFUSED' },
    { port: 3389, outcome: 'TIMEOUT' },
  ])('accepts a permitted observation without changing it', (probe) => {
    const body = { probes: [probe] };
    expect(evaluationSchema.parse(body)).toEqual(body);
  });

  it.each([
    { probes: [] },
    { probes: Array(7).fill({ port: 22, outcome: 'ERROR' }) },
    {
      probes: [
        { port: 22, outcome: 'ERROR' },
        { port: 22, outcome: 'REFUSED' },
      ],
    },
    { probes: [{ port: '22', outcome: 'ERROR' }] },
    { probes: [{ port: 21, outcome: 'ERROR' }] },
    { probes: [{ port: 22, outcome: 'REJECTED' }] },
    { probes: [{ port: 22, outcome: 'ACCEPTED', protocol: 'SSH' }] },
    {
      probes: [
        { port: 22, outcome: 'ACCEPTED', evidence_kind: 'SSH_IDENTIFICATION' },
      ],
    },
    {
      probes: [
        {
          port: 22,
          outcome: 'ACCEPTED',
          protocol: 'SSH',
          evidence_kind: 'HTTP_RESPONSE',
        },
      ],
    },
    {
      probes: [
        {
          port: 22,
          outcome: 'TIMEOUT',
          protocol: 'SSH',
          evidence_kind: 'SSH_IDENTIFICATION',
        },
      ],
    },
    { probes: [{ port: 22, outcome: 'ERROR', banner: 'secret' }] },
    { probes: [{ port: 22, outcome: 'ERROR' }], ip: '192.0.2.1' },
    {
      probes: [{ port: 22, outcome: 'ERROR' }],
      identification: {
        vendor: ' ',
        product: 'x',
        version: '1',
        source: 'USER_DEVICE_LABEL',
      },
    },
    {
      probes: [{ port: 22, outcome: 'ERROR' }],
      identification: {
        vendor: 'x',
        product: 'x',
        version: '1',
        source: 'USER_DEVICE_LABEL',
        extra: true,
      },
    },
  ])('rejects invalid input %#', (body) => {
    expect(evaluationSchema.safeParse(body).success).toBe(false);
  });

  it('uses Unicode code points for identification length', () => {
    const identification = {
      vendor: '😀'.repeat(80),
      product: 'a',
      version: '1',
      source: 'USER_DEVICE_LABEL',
    };
    const probes = [{ port: 22, outcome: 'ERROR' }];
    expect(evaluationSchema.safeParse({ probes, identification }).success).toBe(
      true,
    );
    expect(
      evaluationSchema.safeParse({
        probes,
        identification: { ...identification, vendor: '😀'.repeat(81) },
      }).success,
    ).toBe(false);
  });
});
