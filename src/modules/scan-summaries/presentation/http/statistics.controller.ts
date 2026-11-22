import {
  Controller,
  Get,
  Header,
  Inject,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentIdentity, SessionGuard } from '../../../auth/auth.public.js';
import type { AuthenticatedIdentity } from '../../../auth/auth.public.js';
import { USER_STATISTICS_READER } from '../../application/ports/user-statistics-reader.port.js';
import type { UserStatisticsReader } from '../../application/ports/user-statistics-reader.port.js';

@Controller('me/stats')
export class StatisticsController {
  constructor(
    @Inject(USER_STATISTICS_READER)
    private readonly statistics: UserStatisticsReader,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @UseGuards(ThrottlerGuard, SessionGuard)
  async get(@CurrentIdentity() identity: AuthenticatedIdentity) {
    const statistics = await this.statistics.read(identity.userId);

    if (statistics === null) {
      throw new UnauthorizedException();
    }

    return {
      summary_generation: statistics.summaryGeneration,
      generated_at: statistics.generatedAt.toISOString(),
      total_scans: statistics.totalScans,
      total_addresses_scanned: statistics.totalAddressesScanned,
      total_addresses_responded: statistics.totalAddressesResponded,
      total_accepted_services: statistics.totalAcceptedServices,
      findings_by_category: statistics.findingsByCategory,
      recent_scans: statistics.recentScans.map((scan) => ({
        scan_id: scan.scanId,
        started_at: scan.startedAt.toISOString(),
        accepted_services: scan.acceptedServices,
        findings_by_category: scan.findingsByCategory,
      })),
    };
  }
}
