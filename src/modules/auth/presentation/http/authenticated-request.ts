import type { Request } from 'express';
import type { AuthenticatedIdentity } from '../../domain/authenticated-identity.js';

export type AuthenticatedRequest = Request & {
  identity?: AuthenticatedIdentity;
};