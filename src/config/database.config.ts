import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const requiredText = z.string().regex(/^\S+$/);

const databaseSchema = z.object({
  DB_HOST: z.hostname(),
  DB_PORT: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535))
    .default(5432),
  DB_NAME: requiredText,
  DB_USER: requiredText,
  DB_PASSWORD: z.string().min(1),
  DB_SSL_CA_PATH: z.string().refine((value) => value.trim().length > 0),
});

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  caPath: string;
}

export function validateDatabaseEnvironment(
  values: Record<string, unknown>,
): DatabaseConfig {
  const result = databaseSchema.safeParse(values);

  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];

    throw new Error(`Configuración PostgreSQL inválida: ${fields.join(', ')}.`);
  }

  const data = result.data;

  return {
    host: data.DB_HOST,
    port: data.DB_PORT,
    database: data.DB_NAME,
    user: data.DB_USER,
    password: data.DB_PASSWORD,
    caPath: data.DB_SSL_CA_PATH,
  };
}

export const databaseConfig = registerAs('database', () =>
  validateDatabaseEnvironment(process.env),
);
