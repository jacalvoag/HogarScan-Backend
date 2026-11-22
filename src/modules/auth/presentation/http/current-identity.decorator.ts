import { createParamDecorator, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../../domain/authenticated-identity.js';
import type { AuthenticatedRequest } from './authenticated-request.js';

export const CurrentIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedIdentity => {
    const { identity } = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();

    if (identity === undefined) {
      throw new UnauthorizedException();
    }

    return identity;
  },
);