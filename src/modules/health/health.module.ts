import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module.js';
import { PostgresReadiness } from './infrastructure/postgres-readiness.js';
import { HealthController } from './presentation/http/health.controller.js';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    DatabaseModule,
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 60 }],
    }),
  ],
  controllers: [HealthController],
  providers: [PostgresReadiness, ThrottlerGuard],
})
export class HealthModule {}
