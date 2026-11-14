import {
  Controller,
  Delete,
  Header,
  Inject,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentIdentity, SessionGuard } from '../../../auth/auth.public.js';
import type { AuthenticatedIdentity } from '../../../auth/auth.public.js';
import { ApiException } from '../../../../shared/http/api-exception.js';
import { SCAN_SUMMARY_DELETER } from '../../application/ports/scan-summary-deleter.port.js';
import type { ScanSummaryDeleter } from '../../application/ports/scan-summary-deleter.port.js';
import { parseDeleteSummariesRequest } from './parse-delete-summaries-request.js';

@Controller('me/scans')
export class DeleteScanSummariesController {
  constructor(
    @Inject(SCAN_SUMMARY_DELETER)
    private readonly deleter: ScanSummaryDeleter,
  ) {}

  @Delete()
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(ThrottlerGuard, SessionGuard)
  async deleteAll(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Req() request: RawBodyRequest<Request>,
  ) {
    const generation = parseDeleteSummariesRequest(request);
    const result = await this.deleter.deleteAll(identity.userId, generation);

    switch (result.status) {
      case 'ACCOUNT_NOT_FOUND':
        throw new UnauthorizedException();

      case 'STALE_GENERATION':
        throw new ApiException(
          'STALE_SUMMARY_GENERATION',
          result.currentGeneration,
        );

      case 'FUTURE_GENERATION':
        throw new ApiException(
          'INVALID_SUMMARY_GENERATION',
          result.currentGeneration,
        );

      case 'DELETED':
        return {
          deleted_count: result.receipt.deletedCount,
          summary_generation: result.receipt.summaryGeneration,
          deleted_at: result.receipt.deletedAt.toISOString(),
        };

      default:
        throw new Error('Unexpected summary deletion result.');
    }
  }
}
