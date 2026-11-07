import type { AuthenticatedIdentity } from '../../domain/authenticated-identity.js';

export const SESSION_VERIFIER = Symbol('SESSION_VERIFIER');

export interface SessionVerifier {
  // null: sesión inexistente, vencida o revocada.
  verify(token: string): Promise<AuthenticatedIdentity | null>;
}