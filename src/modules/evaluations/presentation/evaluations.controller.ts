import {
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../../auth/auth.public.js';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { EvaluateBasic } from '../application/evaluate-basic.js';
import {
  toEvaluationInput,
  toEvaluationResponse,
} from './evaluation.mapper.js';
import { evaluationSchema } from './evaluation.schema.js';
import type { EvaluationBody } from './evaluation.schema.js';

@Controller('evaluations')
export class EvaluationsController {
  constructor(
    @Inject(EvaluateBasic) private readonly evaluate: EvaluateBasic,
  ) {}

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @UseGuards(ThrottlerGuard, SessionGuard)
  evaluateObservation(
    @Body({ schema: evaluationSchema }) body: EvaluationBody,
  ) {
    return toEvaluationResponse(this.evaluate.execute(toEvaluationInput(body)));
  }
}
