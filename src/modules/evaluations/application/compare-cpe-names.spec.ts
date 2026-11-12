import { compareCpeNames } from './compare-cpe-names.js';

describe('Conservative CPE name comparison', () => {
  const criterion = 'cpe:2.3:a:example:router:1.2.3:*:*:*:*:*:*:*';
  it('compares a resolved CPE without relying on case', () => {
    expect(
      compareCpeNames(
        criterion,
        'cpe:2.3:a:EXAMPLE:ROUTER:1.2.3:*:*:*:*:*:*:*',
      ),
    ).toBe('TRUE');
    expect(
      compareCpeNames(criterion, 'cpe:2.3:a:other:router:1.2.3:*:*:*:*:*:*:*'),
    ).toBe('FALSE');
  });

  it('handles ANY and NA without treating an unknown target as a specific value', () => {
    expect(
      compareCpeNames('cpe:2.3:a:example:router:*:*:*:*:*:*:*:*', criterion),
    ).toBe('TRUE');
    expect(
      compareCpeNames(criterion, 'cpe:2.3:a:example:router:*:*:*:*:*:*:*:*'),
    ).toBe('UNKNOWN');
    expect(
      compareCpeNames('cpe:2.3:a:example:router:-:*:*:*:*:*:*:*', criterion),
    ).toBe('FALSE');
    expect(
      compareCpeNames(
        'cpe:2.3:a:example:router:-:*:*:*:*:*:*:*',
        'cpe:2.3:a:example:router:-:*:*:*:*:*:*:*',
      ),
    ).toBe('TRUE');
  });

  it.each([
    'cpe:2.3:a:example:router:1.*:*:*:*:*:*:*:*',
    String.raw`cpe:2.3:a:example:my\:router:1.2.3:*:*:*:*:*:*:*`,
    'cpe:2.3:a:example:router:1.2.3:*:*:*:*:*:*',
    'cpe:2.3:a:example:router:1.2.3:*:*:*:*:*:*:*:extra',
    'cpe:2.3:a:example:router:1.2.3:*:*:*:*:*:*:bad value',
    'cpe:2.3:x:example:router:1.2.3:*:*:*:*:*:*:*',
    'cpe:2.3:a:example:router:1.2.3:*:*:*:*:*:*:bad\n',
    'cpe:2.3:a:example:router:1.2.3:*:*:x:*:*:*:*',
  ])(
    'does not guess how to compare unsupported or invalid CPE %#',
    (unsupported) => {
      expect(compareCpeNames(unsupported, criterion)).toBe('UNKNOWN');
      expect(compareCpeNames(criterion, unsupported)).toBe('UNKNOWN');
    },
  );
});
