import { Inject, Logger, Module } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { Pool } from 'pg';
import { databaseConfig } from '../../config/database.config.js';
import { createPostgresPool } from './create-postgres-pool.js';
import { POSTGRES_POOL } from './postgres-pool.token.js';

@Module({
  imports: [ConfigModule.forFeature(databaseConfig)],
  providers: [
    {
      provide: POSTGRES_POOL,
      inject: [databaseConfig.KEY],
      useFactory: createPostgresPool,
    },
  ],
  exports: [POSTGRES_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {
    this.logger.log('Conexión con PostgreSQL verificada.');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
    this.logger.log('Pool de PostgreSQL cerrado.');
  }
}
