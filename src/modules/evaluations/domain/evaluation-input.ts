import { createProductIdentification } from './product-identification.js';
import type { ProductIdentification } from './product-identification.js';
import { createTcpObservations } from './tcp-observations.js';
import type { TcpObservation } from './tcp-observations.js';

/** Normalized data supplied for one evaluation, after boundary decoding. */
export interface EvaluationInput {
  readonly observations: readonly TcpObservation[];
  readonly identification?: ProductIdentification;
}

export function createEvaluationInput(input: EvaluationInput): EvaluationInput {
  const observations = createTcpObservations(input.observations);
  if (input.identification === undefined) {
    return { observations };
  }

  const identification = createProductIdentification(input.identification);
  if (
    identification.source === 'SERVICE_RESPONSE' &&
    !observations.some(
      (probe) =>
        probe.port === identification.servicePort &&
        probe.outcome === 'ACCEPTED' &&
        probe.protocol !== undefined,
    )
  ) {
    throw new Error(
      'Service identification must refer to an accepted, identified observation',
    );
  }
  return { observations, identification };
}
