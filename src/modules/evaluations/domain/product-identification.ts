export type IdentificationSource = 'USER_DEVICE_LABEL' | 'USER_ADMIN_PANEL';

/** Product information declared by the user, not verified device identification. */
export interface ProductIdentification {
  readonly vendor: string;
  readonly product: string;
  readonly version: string;
  readonly source: IdentificationSource;
}

/** Validates domain invariants after the input has been decoded. */
export function createProductIdentification(
  identification: ProductIdentification,
): ProductIdentification {
  const fields = [
    [identification.vendor, 80],
    [identification.product, 120],
    [identification.version, 80],
  ] as const;

  for (const [value, maximumLength] of fields) {
    if (!/\S/u.test(value) || Array.from(value).length > maximumLength) {
      throw new Error('Invalid product identification');
    }
  }

  return { ...identification };
}
