import { interpretBasicTcp } from './interpret-basic-tcp.js';
import { evaluationSchema } from '../presentation/evaluation.schema.js';
import { toEvaluationInput } from '../presentation/evaluation.mapper.js';

describe('evidencia y orientación preventiva', () => {
  it('HTTP sin TLS genera orientación específica sin declarar una vulnerabilidad', () => {
    const result = interpretBasicTcp({
      observations: [
        {
          port: 80,
          outcome: 'ACCEPTED',
          protocol: 'HTTP',
          evidenceKind: 'HTTP_RESPONSE',
        },
      ],
    });
    expect(
      result.findings.find((f) => f.category === 'PREVENTIVE_REVIEW'),
    ).toMatchObject({ priority: 'MEDIUM', confidence: 'OBSERVED', cve: null });
    expect(
      result.findings.find((f) => f.category === 'PREVENTIVE_REVIEW')?.action,
    ).toContain('HTTPS');
  });
  it('RDP habitual solo orienta y no inventa un protocolo por el puerto', () => {
    const result = interpretBasicTcp({
      observations: [{ port: 3389, outcome: 'ACCEPTED' }],
    });
    expect(
      result.findings.some((f) => f.category === 'PROTOCOL_IDENTIFIED'),
    ).toBe(false);
    expect(
      result.findings.find((f) => f.category === 'PREVENTIVE_REVIEW'),
    ).toMatchObject({ confidence: 'POSSIBLE', cve: null });
  });
  it('la identidad de una respuesta exige un puerto aceptado e identificado', () => {
    const identity = {
      vendor: 'apache',
      product: 'http_server',
      version: '2.4.49',
      source: 'SERVICE_RESPONSE',
      service_port: 80,
    };
    expect(
      evaluationSchema.safeParse({
        probes: [{ port: 80, outcome: 'ACCEPTED' }],
        identification: identity,
      }).success,
    ).toBe(false);
    const body = evaluationSchema.parse({
      probes: [
        {
          port: 80,
          outcome: 'ACCEPTED',
          protocol: 'HTTP',
          evidence_kind: 'HTTP_RESPONSE',
        },
      ],
      identification: identity,
    });
    expect(toEvaluationInput(body).identification).toMatchObject({
      source: 'SERVICE_RESPONSE',
      servicePort: 80,
    });
  });
  it('acepta FTP en el puerto 21 manteniendo el máximo de seis observaciones', () => {
    expect(
      evaluationSchema.safeParse({
        probes: [
          {
            port: 21,
            outcome: 'ACCEPTED',
            protocol: 'FTP',
            evidence_kind: 'FTP_GREETING',
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      evaluationSchema.safeParse({
        probes: [21, 22, 23, 80, 443, 445, 3389].map((port) => ({
          port,
          outcome: 'ACCEPTED',
        })),
      }).success,
    ).toBe(false);
  });
});
