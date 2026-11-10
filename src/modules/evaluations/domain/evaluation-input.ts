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

  return {
    observations,
    identification: createProductIdentification(input.identification),
  };
}
