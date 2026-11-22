import { createScanSummary } from '../domain/scan-summary.js';
import type { ScanSummary } from '../domain/scan-summary.js';
import type {
  SaveSummaryResult,
  ScanSummaryWriter,
} from './ports/scan-summary-writer.port.js';

export class SaveScanSummary {
  constructor(private readonly writer: ScanSummaryWriter) {}

  async execute(
    userId: string,
    input: ScanSummary,
  ): Promise<SaveSummaryResult> {
    const summary = createScanSummary(input);
    return this.writer.save(userId, summary);
  }
}
