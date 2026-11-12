import { z } from 'zod';
import {
  MAX_PROBES_PER_EVALUATION,
  PILOT_PORTS,
} from '../domain/tcp-observations.js';

const port = z.literal(PILOT_PORTS);
const probe = z.union([
  z.strictObject({
    port,
    outcome: z.enum(['ACCEPTED', 'REFUSED', 'TIMEOUT', 'ERROR']),
  }),
  z.strictObject({
    port,
    outcome: z.literal('ACCEPTED'),
    protocol: z.literal('HTTP'),
    evidence_kind: z.literal('HTTP_RESPONSE'),
  }),
  z.strictObject({
    port,
    outcome: z.literal('ACCEPTED'),
    protocol: z.literal('HTTPS'),
    evidence_kind: z.literal('HTTPS_RESPONSE'),
  }),
  z.strictObject({
    port,
    outcome: z.literal('ACCEPTED'),
    protocol: z.literal('SSH'),
    evidence_kind: z.literal('SSH_IDENTIFICATION'),
  }),
  z.strictObject({
    port,
    outcome: z.literal('ACCEPTED'),
    protocol: z.literal('FTP'),
    evidence_kind: z.literal('FTP_GREETING'),
  }),
]);

const text = (max: number) =>
  z
    .string()
    .regex(/\S/u)
    .refine((value) => Array.from(value).length <= max);
const identification = z.strictObject({
  vendor: text(80),
  product: text(120),
  version: text(80),
  source: z.enum(['USER_DEVICE_LABEL', 'USER_ADMIN_PANEL']),
});

export const evaluationSchema = z.strictObject({
  probes: z
    .array(probe)
    .min(1)
    .max(MAX_PROBES_PER_EVALUATION)
    .refine(
      (probes) =>
        new Set(probes.map(({ port: value }) => value)).size === probes.length,
    ),
  identification: identification.optional(),
});
export type EvaluationBody = z.infer<typeof evaluationSchema>;
