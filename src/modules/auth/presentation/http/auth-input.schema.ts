import { z } from 'zod';

export const emailSchema = z.email().min(3).max(254).regex(/^\S+$/u);

export function passwordSchema(minimumLength: number) {
  return z.string().refine((value) => {
    const length = Array.from(value).length;

    return (
      length >= minimumLength &&
      length <= 128 &&
      !/[\uD800-\uDFFF]/u.test(value)
    );
  });
}
