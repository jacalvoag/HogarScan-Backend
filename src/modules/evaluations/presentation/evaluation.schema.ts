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
const identificationFields = {
  vendor: text(80),
  product: text(120),
  version: text(80),
};
const identification = z.union([
  z.strictObject({
    ...identificationFields,
    source: z.enum(['USER_DEVICE_LABEL', 'USER_ADMIN_PANEL']),
  }),
  z.strictObject({
    ...identificationFields,
    source: z.literal('SERVICE_RESPONSE'),
    service_port: port,
  }),
]);

export const evaluationSchema = z
  .strictObject({
    probes: z
      .array(probe)
      .min(1)
      .max(MAX_PROBES_PER_EVALUATION)
      .refine(
        (probes) =>
          new Set(probes.map(({ port: value }) => value)).size ===
          probes.length,
      ),
    identification: identification.optional(),
  })
  .refine((body) => {
    const identity = body.identification;
    return (
      identity?.source !== 'SERVICE_RESPONSE' ||
      body.probes.some(
        (probe) =>
          probe.port === identity.service_port &&
          probe.outcome === 'ACCEPTED' &&
          'protocol' in probe,
      )
    );
  });
export type EvaluationBody = z.infer<typeof evaluationSchema>;
