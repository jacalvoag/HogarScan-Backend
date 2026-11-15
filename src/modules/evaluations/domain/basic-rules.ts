/** Published ruleset shared by both evaluation endpoints. */
export const EVALUATION_RULESET_VERSION = '0.3.0';
export const EVALUATION_RULESET_PUBLISHED_AT = '2026-11-15T08:56:16Z';

export const BASIC_RULE_IDS = {
  accepted: 'TCP_ACCEPTED',
  protocol: 'PROTOCOL_IDENTIFIED',
  refused: 'TCP_REFUSED',
  timeout: 'TCP_TIMEOUT',
  error: 'TCP_ERROR',
} as const;
