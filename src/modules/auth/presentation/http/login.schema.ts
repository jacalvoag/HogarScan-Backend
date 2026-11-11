import { z } from 'zod';
import { emailSchema, passwordSchema } from './auth-input.schema.js';

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema(1),
});

export type LoginBody = z.infer<typeof loginSchema>;
