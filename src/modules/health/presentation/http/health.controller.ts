import {
  Controller,
  Get,
  Header,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PostgresReadiness } from '../../infrastructure/postgres-readiness.js';

@Controller('health')
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
