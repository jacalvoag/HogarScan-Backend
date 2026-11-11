import {
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  InvalidSessionError,
  ManageCurrentSession,
} from '../../application/manage-current-session.js';
import type { AuthenticatedIdentity } from '../../domain/authenticated-identity.js';
import { CurrentIdentity } from './current-identity.decorator.js';
import { CurrentSessionToken } from './current-session-token.decorator.js';
import { SessionGuard } from './session.guard.js';

@Controller('auth')
@UseGuards(ThrottlerGuard, SessionGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class CurrentSessionController {
  constructor(
    @Inject(ManageCurrentSession)
    private readonly sessions: ManageCurrentSession,
  ) {}

  @Get('me')
  @Header('Cache-Control', 'no-store')
  async me(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @CurrentSessionToken() token: string,
  ) {
    try {
      const session = await this.sessions.get(identity.userId, token);

      return {
        user: {
          id: session.user.id,
          email: session.user.email,
          created_at: session.user.createdAt.toISOString(),
        },
        expires_at: session.expiresAt.toISOString(),
        summary_generation: session.summaryGeneration,
      };
    } catch (error) {
      if (error instanceof InvalidSessionError)
        throw new UnauthorizedException();

      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async logout(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @CurrentSessionToken() token: string,
  ): Promise<void> {
    try {
      await this.sessions.revoke(identity.userId, token);
    } catch (error) {
      if (error instanceof InvalidSessionError)
        throw new UnauthorizedException();

      throw error;
    }
  }
}
