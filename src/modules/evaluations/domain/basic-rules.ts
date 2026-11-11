/** Version of the rules implemented by the basic interpreter. */
export const BASIC_RULESET_VERSION = '0.1.0';

export const BASIC_RULE_IDS = {
  accepted: 'TCP_ACCEPTED',
  protocol: 'PROTOCOL_IDENTIFIED',
  refused: 'TCP_REFUSED',
  timeout: 'TCP_TIMEOUT',
  error: 'TCP_ERROR',
} as const;
