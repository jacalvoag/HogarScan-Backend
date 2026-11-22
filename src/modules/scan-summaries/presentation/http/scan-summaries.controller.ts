import {
  Body,
  Controller,
  Header,
  Inject,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentIdentity, SessionGuard } from '../../../auth/auth.public.js';
import type { AuthenticatedIdentity } from '../../../auth/auth.public.js';
import { ApiException } from '../../../../shared/http/api-exception.js';
import { SaveScanSummary } from '../../application/save-scan-summary.js';
import {
  scanSummarySchema,
  toScanSummaryInput,
} from './scan-summary.schema.js';
import type { ScanSummaryBody } from './scan-summary.schema.js';

@Controller('me/scans')
export class ScanSummariesController {
  constructor(
    @Inject(SaveScanSummary)
    private readonly saveSummary: SaveScanSummary,
  ) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @UseGuards(ThrottlerGuard, SessionGuard)
  async save(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body({ schema: scanSummarySchema }) body: ScanSummaryBody,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.saveSummary.execute(
      identity.userId,
      toScanSummaryInput(body),
    );

    switch (result.status) {
      case 'ACCOUNT_NOT_FOUND':
        throw new UnauthorizedException();

      case 'CONFLICT':
        throw new ApiException('SUMMARY_CONFLICT');

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

      case 'SAVED': {
        const { receipt } = result;

        response.status(receipt.created ? 201 : 200);

        return {
          scan_id: receipt.scanId,
          summary_generation: receipt.summaryGeneration,
          received_at: receipt.receivedAt.toISOString(),
          created: receipt.created,
        };
      }

      default:
        throw new Error('Unexpected summary save result.');
    }
  }
}
