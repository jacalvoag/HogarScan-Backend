import policy from './preventive-rules.json' with { type: 'json' };

/** Published ruleset shared by both evaluation endpoints. */
export const EVALUATION_RULESET_VERSION = policy.version;
export const EVALUATION_RULESET_PUBLISHED_AT = policy.published_at;

export const BASIC_RULE_IDS = {
  accepted: 'TCP_ACCEPTED',
  protocol: 'PROTOCOL_IDENTIFIED',
  refused: 'TCP_REFUSED',
  timeout: 'TCP_TIMEOUT',
  error: 'TCP_ERROR',
} as const;
