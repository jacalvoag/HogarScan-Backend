import policy from './preventive-rules.json' with { type: 'json' };
import type { TcpObservation } from './tcp-observations.js';
import type { Finding } from './finding.js';

/** Prioridad de revisión, no probabilidad de explotación ni severidad CVSS. */
export function preventiveGuidance(probe: TcpObservation): Finding | undefined {
  if (probe.outcome !== 'ACCEPTED') return undefined;
  if (probe.protocol !== undefined) {
    const rule = policy.protocols[probe.protocol];
    return {
      category: 'PREVENTIVE_REVIEW',
      title: `Revisar exposición ${probe.protocol} del puerto ${probe.port}`,
      priority: rule.priority === 'LOW' ? 'LOW' : 'MEDIUM',
      confidence: 'OBSERVED',
      evidence: `Se recibió evidencia normalizada ${probe.evidenceKind} en el puerto ${probe.port}.`,
      explanation: rule.explanation,
      action: rule.action,
      limitation:
        'La prioridad orienta una revisión preventiva. No demuestra vulnerabilidad, exposición a Internet ni explotación del equipo.',
      ruleId: `PREVENTIVE_${probe.protocol}`,
      cve: null,
    };
  }
  const action = policy.ports[String(probe.port) as keyof typeof policy.ports];
  if (action === undefined) return undefined;
  return {
    category: 'PREVENTIVE_REVIEW',
    title: `Revisar servicio no identificado del puerto ${probe.port}`,
    priority: 'MEDIUM',
    confidence: 'POSSIBLE',
    evidence: `La conexión TCP al puerto ${probe.port} fue aceptada, sin evidencia que identifique el protocolo.`,
    explanation:
      'El uso habitual del puerto orienta una comprobación; no identifica el servicio que responde.',
    action,
    limitation:
      'No se confirmó Telnet, SMB ni RDP por el número de puerto. La prioridad es preventiva y no acredita una vulnerabilidad.',
    ruleId: 'PREVENTIVE_UNIDENTIFIED_EXPOSURE',
    cve: null,
  };
}
