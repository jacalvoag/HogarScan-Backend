import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { SESSION_VERIFIER } from '../../application/ports/session-verifier.port.js';
import type { SessionVerifier } from '../../application/ports/session-verifier.port.js';
import type { AuthenticatedRequest } from './authenticated-request.js';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(SESSION_VERIFIER) private readonly sessions: SessionVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorizationHeaders = request.rawHeaders.filter(
      (header, index) =>
        index % 2 === 0 && header.toLowerCase() === 'authorization',
    );
    const token = request.headers.authorization?.match(
      /^Bearer +([A-Za-z0-9_-]{43})$/i,
    )?.[1];

    if (authorizationHeaders.length !== 1 || token === undefined) {
      throw new UnauthorizedException();
    }

    const identity = await this.sessions.verify(token);
    if (identity === null) {
      throw new UnauthorizedException();
    }

    request.identity = identity;
    return true;
  }
}