import {
  FINDING_CATEGORIES,
  FINDING_CONFIDENCE_LEVELS,
  FINDING_PRIORITIES,
} from './finding-classification.js';

describe('Finding classifications', () => {
  it('provides each contract category once', () => {
    expect(FINDING_CATEGORIES).toEqual([
      'TCP_SERVICE_ACCESSIBLE',
      'PROTOCOL_IDENTIFIED',
      'PREVENTIVE_REVIEW',
      'POSSIBLE_CVE_MATCH',
      'INSUFFICIENT_EVIDENCE',
    ]);
    expect(new Set(FINDING_CATEGORIES).size).toBe(FINDING_CATEGORIES.length);
  });

  it('provides the contract priorities and confidence levels', () => {
    expect(FINDING_PRIORITIES).toEqual([
      'LOW',
      'MEDIUM',
      'HIGH',
      'UNDETERMINED',
    ]);
    expect(FINDING_CONFIDENCE_LEVELS).toEqual([
      'OBSERVED',
      'DECLARED',
      'POSSIBLE',
      'INCONCLUSIVE',
    ]);
  });
});
