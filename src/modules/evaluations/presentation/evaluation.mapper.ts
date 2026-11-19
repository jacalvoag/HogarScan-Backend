import type { EvaluationResult } from '../application/evaluate-with-sources.js';
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
    : {
        observations,
        identification:
          body.identification.source === 'SERVICE_RESPONSE'
            ? {
                vendor: body.identification.vendor,
                product: body.identification.product,
                version: body.identification.version,
                source: body.identification.source,
                servicePort: body.identification.service_port,
              }
            : body.identification,
      };
}

export function toEvaluationResponse(result: EvaluationResult) {
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
    possible_cve_matches: result.possibleCveMatches.map((match) => ({
      cve: match.cve,
      vendor: match.identification.vendor,
      product: match.identification.product,
      version: match.identification.version,
      identification_source: match.identification.source,
      ...(match.identification.servicePort === undefined
        ? {}
        : { service_port: match.identification.servicePort }),
      affected_condition: match.affectedCondition,
      nvd_url: `https://nvd.nist.gov/vuln/detail/${match.cve}`,
      nvd_checked_at: match.nvdCheckedAt.toISOString(),
      in_kev: match.inKev,
    })),
  };
}
