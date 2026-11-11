import { z } from 'zod';

export const registerSchema = z.strictObject({
  email: z.email().min(3).max(254).regex(/^\S+$/u),
  password: z.string().refine((value) => {
    const length = Array.from(value).length;

    return length >= 15 && length <= 128 && !/[\uD800-\uDFFF]/u.test(value);
  }),
});

export type RegisterBody = z.infer<typeof registerSchema>;
