import { Controller, Get, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { trackClientIp } from './rate-limit-tracker.js';
import {
  BASIC_RULESET_PUBLISHED_AT,
  BASIC_RULESET_VERSION,
} from '../domain/basic-rules.js';
import { FINDING_CATEGORIES } from '../domain/finding-classification.js';
import {
  MAX_PROBES_PER_EVALUATION,
  PILOT_PORTS,
} from '../domain/tcp-observations.js';

@Controller('rules')
export class RulesController {
  @Get()
  @Throttle({ default: { limit: 60, ttl: 60_000, getTracker: trackClientIp } })
  @UseGuards(ThrottlerGuard)
  getRules() {
    return {
      ruleset_version: BASIC_RULESET_VERSION,
      published_at: BASIC_RULESET_PUBLISHED_AT,
      categories: [...FINDING_CATEGORIES],
      max_probes_per_evaluation: MAX_PROBES_PER_EVALUATION,
      caveat: 'Una conexión aceptada no prueba que exista una vulnerabilidad.',
      max_addresses_per_scan: 254,
      allowed_ports: [...PILOT_PORTS],
    };
  }
}
