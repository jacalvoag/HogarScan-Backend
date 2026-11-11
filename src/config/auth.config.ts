import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  SESSION_TTL_SECONDS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(2_592_000))
    .default(604_800),
});

export interface AuthConfig {
  sessionTtlSeconds: number;
}

export function validateAuthEnvironment(
  values: Record<string, unknown>,
): AuthConfig {
  const result = schema.safeParse(values);

  if (!result.success) {
    throw new Error(
      'SESSION_TTL_SECONDS debe ser un entero entre 1 y 2592000.',
    );
  }

  return { sessionTtlSeconds: result.data.SESSION_TTL_SECONDS };
}

export const authConfig = registerAs('auth', () =>
  validateAuthEnvironment(process.env),
);
