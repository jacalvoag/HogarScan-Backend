import { createParamDecorator, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './authenticated-request.js';

export const CurrentSessionToken = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.headers.authorization?.match(
      /^Bearer +([A-Za-z0-9_-]{43})$/i,
    )?.[1];

    if (request.identity === undefined || token === undefined) {
      throw new UnauthorizedException();
    }

    return token;
  },
);
