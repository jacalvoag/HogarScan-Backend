import { expectTypeOf } from 'vitest';
import type { Finding } from './finding.js';

type Details = {
  title: string;
  priority: 'LOW';
  evidence: string;
  explanation: string;
  action: string;
  limitation: string;
  ruleId: string;
};

describe('Finding', () => {
  it('ties possible CVE findings to possible confidence and a CVE', () => {
    expectTypeOf<
      Details & {
        category: 'POSSIBLE_CVE_MATCH';
        confidence: 'POSSIBLE';
        cve: string;
      }
    >().toExtend<Finding>();
    expectTypeOf<
      Details & {
        category: 'POSSIBLE_CVE_MATCH';
        confidence: 'OBSERVED';
        cve: string;
      }
    >().not.toExtend<Finding>();
    expectTypeOf<
      Details & {
        category: 'POSSIBLE_CVE_MATCH';
        confidence: 'POSSIBLE';
        cve: null;
      }
    >().not.toExtend<Finding>();
  });

  it('does not attach a CVE to other categories', () => {
    expectTypeOf<
      Details & {
        category: 'TCP_SERVICE_ACCESSIBLE';
        confidence: 'OBSERVED';
        cve: null;
      }
    >().toExtend<Finding>();
    expectTypeOf<
      Details & {
        category: 'TCP_SERVICE_ACCESSIBLE';
        confidence: 'OBSERVED';
        cve: string;
      }
    >().not.toExtend<Finding>();
  });
});
