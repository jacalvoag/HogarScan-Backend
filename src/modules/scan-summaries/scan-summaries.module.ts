import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module.js';
import { AuthModule } from '../auth/auth.public.js';
import { SCAN_SUMMARY_WRITER } from './application/ports/scan-summary-writer.port.js';
import type { ScanSummaryWriter } from './application/ports/scan-summary-writer.port.js';
import { SaveScanSummary } from './application/save-scan-summary.js';
import { PostgresScanSummaryWriter } from './infrastructure/persistence/postgres-scan-summary-writer.js';
import { ScanSummariesController } from './presentation/http/scan-summaries.controller.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ScanSummariesController],
  providers: [
    {
      provide: SCAN_SUMMARY_WRITER,
      useClass: PostgresScanSummaryWriter,
    },
    {
      provide: SaveScanSummary,
      inject: [SCAN_SUMMARY_WRITER],
      useFactory: (writer: ScanSummaryWriter) => new SaveScanSummary(writer),
    },
  ],
})
export class ScanSummariesModule {}
