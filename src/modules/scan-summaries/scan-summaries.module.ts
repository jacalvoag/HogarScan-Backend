import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module.js';
import { AuthModule } from '../auth/auth.public.js';
import { SCAN_SUMMARY_WRITER } from './application/ports/scan-summary-writer.port.js';
import type { ScanSummaryWriter } from './application/ports/scan-summary-writer.port.js';
import { USER_STATISTICS_READER } from './application/ports/user-statistics-reader.port.js';
import { SCAN_SUMMARY_DELETER } from './application/ports/scan-summary-deleter.port.js';
import { SaveScanSummary } from './application/save-scan-summary.js';
import { PostgresScanSummaryWriter } from './infrastructure/persistence/postgres-scan-summary-writer.js';
import { PostgresUserStatisticsReader } from './infrastructure/persistence/postgres-user-statistics-reader.js';
import { PostgresScanSummaryDeleter } from './infrastructure/persistence/postgres-scan-summary-deleter.js';
import { ScanSummariesController } from './presentation/http/scan-summaries.controller.js';
import { StatisticsController } from './presentation/http/statistics.controller.js';
import { DeleteScanSummariesController } from './presentation/http/delete-scan-summaries.controller.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [
    ScanSummariesController,
    StatisticsController,
    DeleteScanSummariesController,
  ],
  providers: [
    { provide: SCAN_SUMMARY_WRITER, useClass: PostgresScanSummaryWriter },
    { provide: USER_STATISTICS_READER, useClass: PostgresUserStatisticsReader },
    { provide: SCAN_SUMMARY_DELETER, useClass: PostgresScanSummaryDeleter },
    {
      provide: SaveScanSummary,
      inject: [SCAN_SUMMARY_WRITER],
      useFactory: (writer: ScanSummaryWriter) => new SaveScanSummary(writer),
    },
  ],
})
export class ScanSummariesModule {}
