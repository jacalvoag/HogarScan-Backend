import { expectTypeOf } from 'vitest';
import { createFinding } from './finding.js';
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
  const possibleCve: Finding = {
    category: 'POSSIBLE_CVE_MATCH',
    confidence: 'POSSIBLE',
    cve: 'CVE-2026-1234',
    title: 'Posible coincidencia',
    priority: 'LOW',
    evidence: 'Producto declarado',
    explanation: 'Coincidencia posible',
    action: 'Revisar la información publicada',
    limitation: 'La afectación no está confirmada',
    ruleId: 'POSSIBLE_CVE',
  };

  it('preserves a finding with a valid possible CVE', () => {
    expect(createFinding(possibleCve)).toEqual(possibleCve);
    expect(createFinding(possibleCve)).not.toBe(possibleCve);
  });

  it.each([
    'CVE-2026-123',
    'cve-2026-1234',
    'CVE-26-1234',
    'CVE-2026-1234 ',
    'CVE-2026-1234\n',
  ])('rejects a CVE outside the contract pattern: %s', (cve) => {
    expect(() => createFinding({ ...possibleCve, cve })).toThrow(
      'Invalid CVE identifier',
    );
  });

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
