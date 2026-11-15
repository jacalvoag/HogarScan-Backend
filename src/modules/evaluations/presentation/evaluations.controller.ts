import {
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../../auth/auth.public.js';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { trackClientIp } from './rate-limit-tracker.js';
import { EvaluateWithSources } from '../application/evaluate-with-sources.js';
import type { Request, Response } from 'express';
import {
  toEvaluationInput,
  toEvaluationResponse,
} from './evaluation.mapper.js';
import { evaluationSchema } from './evaluation.schema.js';
import type { EvaluationBody } from './evaluation.schema.js';

@Controller('evaluations')
export class EvaluationsController {
  constructor(
    @Inject(EvaluateWithSources) private readonly evaluate: EvaluateWithSources,
  ) {}

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 600, ttl: 60_000, getTracker: trackClientIp } })
  @UseGuards(ThrottlerGuard, SessionGuard)
  async evaluateObservation(
    @Body({ schema: evaluationSchema }) body: EvaluationBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const disconnected = new AbortController();
    const onClose = () => disconnected.abort();
    request.once('aborted', onClose);
    response.once('close', onClose);
    try {
      const result = await this.evaluate.execute(
        toEvaluationInput(body),
        disconnected.signal,
      );
      if (!disconnected.signal.aborted && !response.destroyed)
        response.status(200).json(toEvaluationResponse(result));
    } catch (error) {
      if (!disconnected.signal.aborted && !response.destroyed) throw error;
    } finally {
      request.removeListener('aborted', onClose);
      response.removeListener('close', onClose);
    }
  }
}
