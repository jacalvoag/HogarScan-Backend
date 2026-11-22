import { z } from 'zod';
import { emailSchema, passwordSchema } from './auth-input.schema.js';

export const registerSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema(15),
});

export type RegisterBody = z.infer<typeof registerSchema>;
