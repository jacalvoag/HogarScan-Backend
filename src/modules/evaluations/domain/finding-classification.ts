/** Classifications shared by findings and the versioned rules metadata. */
export const FINDING_CATEGORIES = [
  'TCP_SERVICE_ACCESSIBLE',
  'PROTOCOL_IDENTIFIED',
  'PREVENTIVE_REVIEW',
  'POSSIBLE_CVE_MATCH',
  'INSUFFICIENT_EVIDENCE',
] as const;

export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export const FINDING_PRIORITIES = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'UNDETERMINED',
] as const;
export type FindingPriority = (typeof FINDING_PRIORITIES)[number];

export const FINDING_CONFIDENCE_LEVELS = [
  'OBSERVED',
  'DECLARED',
  'POSSIBLE',
  'INCONCLUSIVE',
] as const;
export type FindingConfidence = (typeof FINDING_CONFIDENCE_LEVELS)[number];
