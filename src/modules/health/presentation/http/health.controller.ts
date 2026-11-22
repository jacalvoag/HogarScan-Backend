import {
  Controller,
  Get,
  Header,
  Inject,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { PostgresReadiness } from '../../infrastructure/postgres-readiness.js';
import { ThrottlerGuard } from '@nestjs/throttler';

@Controller('health')
@UseGuards(ThrottlerGuard)
export class HealthController {
  constructor(
    @Inject(PostgresReadiness)
    private readonly database: PostgresReadiness,
  ) {}

  @Get('live')
  @Header('Cache-Control', 'no-store')
  live() {
    return { status: 'ok' } as const;
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready() {
    if (!(await this.database.check())) {
      throw new ServiceUnavailableException();
    }

    return { status: 'ok' } as const;
  }
}
