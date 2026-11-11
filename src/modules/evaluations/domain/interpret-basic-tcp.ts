import { BASIC_RULE_IDS, BASIC_RULESET_VERSION } from './basic-rules.js';
import { createEvaluationInput } from './evaluation-input.js';
import type { EvaluationInput } from './evaluation-input.js';
import type { Finding } from './finding.js';
import type { ProbeOutcome } from './tcp-observations.js';

const INCONCLUSIVE_OUTCOMES: Record<
  Exclude<ProbeOutcome, 'ACCEPTED'>,
  { ruleId: string; description: string; limitation: string }
> = {
  REFUSED: {
    ruleId: BASIC_RULE_IDS.refused,
    description: 'El intento de conexión fue rechazado.',
    limitation:
      'Un rechazo no demuestra que el equipo o sus servicios estén libres de riesgos.',
  },
  TIMEOUT: {
    ruleId: BASIC_RULE_IDS.timeout,
    description: 'El intento de conexión agotó el tiempo de espera.',
    limitation:
      'Un tiempo de espera no demuestra que el equipo esté ausente ni que el puerto sea seguro.',
  },
  ERROR: {
    ruleId: BASIC_RULE_IDS.error,
    description: 'El intento de conexión terminó con un error.',
    limitation:
      'El error impide concluir si el servicio está disponible o es seguro.',
  },
};

export interface BasicInterpretation {
  readonly rulesetVersion: string;
  readonly findings: readonly Finding[];
}

/** Interprets decoded observations without network or persistence access. */
export function interpretBasicTcp(input: EvaluationInput): BasicInterpretation {
  const { observations } = createEvaluationInput(input);
  const findings: Finding[] = [];

  for (const observation of observations) {
    if (observation.outcome === 'ACCEPTED') {
      findings.push({
        category: 'TCP_SERVICE_ACCESSIBLE',
        title: `Conexión TCP aceptada en el puerto ${observation.port}`,
        priority: 'LOW',
        confidence: 'OBSERVED',
        evidence: `El intento TCP al puerto ${observation.port} fue aceptado.`,
        explanation:
          'Una conexión aceptada no demuestra por sí sola una vulnerabilidad.',
        action:
          'Verificar si el servicio debe estar disponible en la red doméstica.',
        limitation:
          'La observación declarada no certifica la configuración ni una vulnerabilidad.',
        ruleId: BASIC_RULE_IDS.accepted,
        cve: null,
      });

      if (observation.protocol !== undefined) {
        findings.push({
          category: 'PROTOCOL_IDENTIFIED',
          title: `Protocolo ${observation.protocol} identificado en el puerto ${observation.port}`,
          priority: 'LOW',
          confidence: 'OBSERVED',
          evidence: `Se declaró evidencia ${observation.evidenceKind} para ${observation.protocol}.`,
          explanation:
            'La evidencia aportada identifica el protocolo, no un producto ni una vulnerabilidad.',
          action:
            'Verificar que el protocolo sea necesario y esté configurado de forma segura.',
          limitation:
            'La API interpreta la evidencia enviada y no certifica cómo se obtuvo.',
          ruleId: BASIC_RULE_IDS.protocol,
          cve: null,
        });
      }
    } else {
      const rule = INCONCLUSIVE_OUTCOMES[observation.outcome];
      findings.push({
        category: 'INSUFFICIENT_EVIDENCE',
        title: `Resultado TCP inconcluso en el puerto ${observation.port}`,
        priority: 'UNDETERMINED',
        confidence: 'INCONCLUSIVE',
        evidence: `${rule.description} Puerto ${observation.port}.`,
        explanation:
          'No se dispone de evidencia suficiente para valorar la seguridad del servicio.',
        action:
          'Revisar las condiciones de la prueba y repetirla si es necesario.',
        limitation: rule.limitation,
        ruleId: rule.ruleId,
        cve: null,
      });
    }
  }

  return { rulesetVersion: BASIC_RULESET_VERSION, findings };
}
