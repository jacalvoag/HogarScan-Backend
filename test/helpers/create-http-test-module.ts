import { Module } from '@nestjs/common';
import type { ModuleMetadata } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseModule } from '../../src/shared/database/database.module.js';

@Module({})
class OfflineDatabaseModule {}

export function createHttpTestModule(metadata: ModuleMetadata) {
  return Test.createTestingModule(metadata)
    .overrideModule(DatabaseModule)
    .useModule(OfflineDatabaseModule);
}
