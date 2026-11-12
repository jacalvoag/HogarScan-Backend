import type { EvaluateBasic } from '../application/evaluate-basic.js';
import type { EvaluationInput } from '../domain/evaluation-input.js';
import type { TcpObservation } from '../domain/tcp-observations.js';
import type { EvaluationBody } from './evaluation.schema.js';

export function toEvaluationInput(body: EvaluationBody): EvaluationInput {
  const observations: TcpObservation[] = body.probes.map((probe) => {
    if (!('protocol' in probe)) {
      return { port: probe.port, outcome: probe.outcome };
    }
    switch (probe.protocol) {
      case 'HTTP':
        return {
          port: probe.port,
          outcome: probe.outcome,
          protocol: 'HTTP',
          evidenceKind: probe.evidence_kind,
        };
      case 'HTTPS':
        return {
          port: probe.port,
          outcome: probe.outcome,
          protocol: 'HTTPS',
          evidenceKind: probe.evidence_kind,
        };
      case 'SSH':
        return {
          port: probe.port,
          outcome: probe.outcome,
          protocol: 'SSH',
          evidenceKind: probe.evidence_kind,
        };
      case 'FTP':
        return {
          port: probe.port,
          outcome: probe.outcome,
          protocol: 'FTP',
          evidenceKind: probe.evidence_kind,
        };
    }
  });
  return body.identification === undefined
    ? { observations }
    : { observations, identification: body.identification };
}

export function toEvaluationResponse(
  result: ReturnType<EvaluateBasic['execute']>,
) {
  return {
    ruleset_version: result.rulesetVersion,
    evaluated_at: result.evaluatedAt.toISOString(),
    sources: {
      nvd: result.sources.nvd,
      kev: result.sources.kev,
      checked_at: result.sources.checkedAt,
    },
    findings: result.findings.map(({ ruleId, ...finding }) => ({
      ...finding,
      rule_id: ruleId,
    })),
    possible_cve_matches: result.possibleCveMatches,
  };
}
