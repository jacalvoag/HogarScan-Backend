export const PILOT_PORTS = [22, 23, 80, 443, 445, 3389] as const;
export const MAX_PROBES_PER_EVALUATION = 6;

export type PilotPort = (typeof PILOT_PORTS)[number];
export type ProbeOutcome = 'ACCEPTED' | 'REFUSED' | 'TIMEOUT' | 'ERROR';

type ProtocolEvidence =
  | { protocol: 'HTTP'; evidenceKind: 'HTTP_RESPONSE' }
  | { protocol: 'HTTPS'; evidenceKind: 'HTTPS_RESPONSE' }
  | { protocol: 'SSH'; evidenceKind: 'SSH_IDENTIFICATION' }
  | { protocol: 'FTP'; evidenceKind: 'FTP_GREETING' };

/** A protocol is present only when the submitted observation includes evidence. */
export type TcpObservation = { port: PilotPort } & (
  | { outcome: ProbeOutcome; protocol?: never; evidenceKind?: never }
  | ({ outcome: 'ACCEPTED' } & ProtocolEvidence)
);

/** Validates the collection invariants after individual observations are decoded. */
export function createTcpObservations(
  observations: readonly TcpObservation[],
): readonly TcpObservation[] {
  if (
    observations.length < 1 ||
    observations.length > MAX_PROBES_PER_EVALUATION
  ) {
    throw new RangeError('An evaluation requires between 1 and 6 observations');
  }

  if (
    new Set(observations.map(({ port }) => port)).size !== observations.length
  ) {
    throw new Error('An evaluation cannot repeat a port');
  }

  return observations.map((observation) => ({ ...observation }));
}
