import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module.js';
import { PostgresReadiness } from './infrastructure/postgres-readiness.js';
import { HealthController } from './presentation/http/health.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [PostgresReadiness],
})
export class HealthModule {}
