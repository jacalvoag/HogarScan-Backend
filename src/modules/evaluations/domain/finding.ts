import type {
  FindingCategory,
  FindingConfidence,
  FindingPriority,
} from './finding-classification.js';

interface FindingDetails {
  readonly title: string;
  readonly priority: FindingPriority;
  readonly evidence: string;
  readonly explanation: string;
  readonly action: string;
  readonly limitation: string;
  readonly ruleId: string;
}

/** A CVE finding is explicitly possible, never a confirmed vulnerability. */
export type Finding = FindingDetails &
  (
    | {
        readonly category: 'POSSIBLE_CVE_MATCH';
        readonly confidence: 'POSSIBLE';
        readonly cve: string;
      }
    | {
        readonly category: Exclude<FindingCategory, 'POSSIBLE_CVE_MATCH'>;
        readonly confidence: FindingConfidence;
        readonly cve: null;
      }
  );
