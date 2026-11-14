import { registerAs } from '@nestjs/config';
import { z } from 'zod';

function integer(minimum: number, maximum: number, fallback: number) {
  return z
    .string()
    .refine((value) => value.length > 0 && !/[^0-9]/.test(value))
    .transform(Number)
    .pipe(z.number().int().min(minimum).max(maximum))
    .default(fallback);
}

const schema = z
  .object({
    EXTERNAL_SOURCES_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    EXTERNAL_REQUEST_TIMEOUT_MS: integer(1_000, 30_000, 10_000),
    EXTERNAL_EVALUATION_BUDGET_MS: integer(1_000, 60_000, 45_000),
    EXTERNAL_MAX_CONCURRENT_REQUESTS: integer(1, 2, 1),
    EXTERNAL_MAX_QUEUED_REQUESTS: integer(0, 32, 8),
    NVD_MIN_INTERVAL_MS: integer(10_000, 60_000, 10_000),
    NVD_MAX_RESPONSE_BYTES: integer(65_536, 5_242_880, 2_097_152),
    NVD_PAGE_SIZE: integer(1, 100, 50),
    NVD_MAX_PAGES: integer(1, 5, 2),
    KEV_MAX_RESPONSE_BYTES: integer(65_536, 10_485_760, 5_242_880),
    EXTERNAL_CACHE_TTL_SECONDS: integer(60, 86_400, 3_600),
    EXTERNAL_CACHE_MAX_ENTRIES: integer(1, 200, 50),
    EXTERNAL_CACHE_MAX_BYTES: integer(1_048_576, 33_554_432, 8_388_608),
    NVD_API_KEY: z
      .union([
        z.literal(''),
        z
          .string()
          .min(1)
          .max(256)
          .refine((value) => !/[^\x21-\x7e]/.test(value)),
      ])
      .optional(),
  })
  .superRefine((values, context) => {
    if (
      values.EXTERNAL_EVALUATION_BUDGET_MS < values.EXTERNAL_REQUEST_TIMEOUT_MS
    ) {
      context.addIssue({
        code: 'custom',
        path: ['EXTERNAL_EVALUATION_BUDGET_MS'],
        message: 'Budget must cover one request timeout.',
      });
    }

    if (
      values.EXTERNAL_CACHE_MAX_BYTES <
      Math.max(values.NVD_MAX_RESPONSE_BYTES, values.KEV_MAX_RESPONSE_BYTES)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['EXTERNAL_CACHE_MAX_BYTES'],
        message: 'Cache must accommodate one maximum-sized response.',
      });
    }
  });

export interface ExternalSourcesConfig {
  readonly enabled: boolean;
  readonly requestTimeoutMs: number;
  readonly evaluationBudgetMs: number;
  readonly maxConcurrentRequests: number;
  readonly maxQueuedRequests: number;
  readonly nvdMinIntervalMs: number;
  readonly nvdMaxResponseBytes: number;
  readonly nvdPageSize: number;
  readonly nvdMaxPages: number;
  readonly kevMaxResponseBytes: number;
  readonly cacheTtlSeconds: number;
  readonly cacheMaxEntries: number;
  readonly cacheMaxBytes: number;
  readonly nvdApiKey?: string;
}

export function validateExternalSourcesEnvironment(
  values: Record<string, unknown>,
): ExternalSourcesConfig {
  const result = schema.safeParse(values);

  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];

    throw new Error(
      `Configuración de fuentes externas inválida: ${fields.join(', ')}.`,
    );
  }

  const data = result.data;

  return {
    enabled: data.EXTERNAL_SOURCES_ENABLED,
    requestTimeoutMs: data.EXTERNAL_REQUEST_TIMEOUT_MS,
    evaluationBudgetMs: data.EXTERNAL_EVALUATION_BUDGET_MS,
    maxConcurrentRequests: data.EXTERNAL_MAX_CONCURRENT_REQUESTS,
    maxQueuedRequests: data.EXTERNAL_MAX_QUEUED_REQUESTS,
    nvdMinIntervalMs: data.NVD_MIN_INTERVAL_MS,
    nvdMaxResponseBytes: data.NVD_MAX_RESPONSE_BYTES,
    nvdPageSize: data.NVD_PAGE_SIZE,
    nvdMaxPages: data.NVD_MAX_PAGES,
    kevMaxResponseBytes: data.KEV_MAX_RESPONSE_BYTES,
    cacheTtlSeconds: data.EXTERNAL_CACHE_TTL_SECONDS,
    cacheMaxEntries: data.EXTERNAL_CACHE_MAX_ENTRIES,
    cacheMaxBytes: data.EXTERNAL_CACHE_MAX_BYTES,
    nvdApiKey: data.NVD_API_KEY || undefined,
  };
}

export const externalSourcesConfig = registerAs('externalSources', () =>
  validateExternalSourcesEnvironment(process.env),
);
