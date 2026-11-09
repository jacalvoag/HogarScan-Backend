import { Module } from '@nestjs/common';
import type { ModuleMetadata } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseModule } from '../../src/shared/database/database.module.js';
import { POSTGRES_POOL } from '../../src/shared/database/postgres-pool.token.js';

@Module({
  providers: [
    {
      provide: POSTGRES_POOL,
      useFactory: () => ({
        query: async () => {
          throw new Error('Configura una respuesta SQL para esta prueba.');
        },
      }),
    },
  ],
  exports: [POSTGRES_POOL],
})
class OfflineDatabaseModule {}

export function createHttpTestModule(metadata: ModuleMetadata) {
  return Test.createTestingModule(metadata)
    .overrideModule(DatabaseModule)
    .useModule(OfflineDatabaseModule);
}
