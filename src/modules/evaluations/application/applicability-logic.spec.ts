import { combineApplicability } from './applicability-logic.js';

describe('Applicability logic', () => {
  it.each([
    ['AND', ['TRUE', 'TRUE'], 'TRUE'],
    ['AND', ['TRUE', 'UNKNOWN'], 'UNKNOWN'],
    ['AND', ['FALSE', 'UNKNOWN'], 'FALSE'],
    ['AND', ['FALSE', 'TRUE'], 'FALSE'],
    ['OR', ['FALSE', 'FALSE'], 'FALSE'],
    ['OR', ['FALSE', 'UNKNOWN'], 'UNKNOWN'],
    ['OR', ['TRUE', 'UNKNOWN'], 'TRUE'],
    ['OR', ['TRUE', 'FALSE'], 'TRUE'],
  ] as const)(
    'combines %s conditions conservatively',
    (operator, values, result) => {
      expect(combineApplicability(operator, values)).toBe(result);
    },
  );

  it.each([
    ['TRUE', 'FALSE'],
    ['FALSE', 'TRUE'],
    ['UNKNOWN', 'UNKNOWN'],
  ] as const)(
    'negates %s without turning uncertainty into certainty',
    (input, result) => {
      expect(combineApplicability('AND', [input], true)).toBe(result);
    },
  );

  it.each(['AND', 'OR'] as const)(
    'treats empty %s groups as unknown',
    (operator) => {
      expect(combineApplicability(operator, [])).toBe('UNKNOWN');
      expect(combineApplicability(operator, [], true)).toBe('UNKNOWN');
    },
  );
});
