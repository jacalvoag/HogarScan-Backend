import { createProductIdentification } from './product-identification.js';
import type { ProductIdentification } from './product-identification.js';

describe('Product identification', () => {
  const identification: ProductIdentification = {
    vendor: ' Example vendor ',
    product: 'Example product',
    version: '1.0',
    source: 'USER_DEVICE_LABEL',
  };

  it.each(['USER_DEVICE_LABEL', 'USER_ADMIN_PANEL'] as const)(
    'preserves the user-declared values and source %s',
    (source) => {
      const declared = { ...identification, source };
      expect(createProductIdentification(declared)).toEqual(declared);
      expect(createProductIdentification(declared)).not.toBe(declared);
    },
  );

  it.each(['vendor', 'product', 'version'] as const)(
    'rejects empty or whitespace-only %s',
    (field) => {
      for (const value of ['', ' \t\n']) {
        expect(() =>
          createProductIdentification({ ...identification, [field]: value }),
        ).toThrow('Invalid product identification');
      }
    },
  );

  it.each([
    ['vendor', 80],
    ['product', 120],
    ['version', 80],
  ] as const)('enforces the contract length for %s', (field, limit) => {
    expect(() =>
      createProductIdentification({
        ...identification,
        [field]: 'a'.repeat(limit),
      }),
    ).not.toThrow();
    expect(() =>
      createProductIdentification({
        ...identification,
        [field]: 'a'.repeat(limit + 1),
      }),
    ).toThrow('Invalid product identification');
  });

  it('counts Unicode code points rather than UTF-16 units', () => {
    expect(() =>
      createProductIdentification({
        ...identification,
        vendor: '😀'.repeat(80),
      }),
    ).not.toThrow();
    expect(() =>
      createProductIdentification({
        ...identification,
        vendor: '😀'.repeat(81),
      }),
    ).toThrow('Invalid product identification');
  });
});
