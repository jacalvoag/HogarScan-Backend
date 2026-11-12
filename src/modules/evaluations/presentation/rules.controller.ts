import { Controller, Get } from '@nestjs/common';
import { BASIC_RULESET_VERSION } from '../domain/basic-rules.js';
import { FINDING_CATEGORIES } from '../domain/finding-classification.js';
import {
  MAX_PROBES_PER_EVALUATION,
  PILOT_PORTS,
} from '../domain/tcp-observations.js';

@Controller('rules')
export class RulesController {
  @Get()
  getRules() {
    return {
      ruleset_version: BASIC_RULESET_VERSION,
      // Integration of version 0.1.0 into develop (PR #24).
      published_at: '2026-11-11T05:32:32Z',
      categories: [...FINDING_CATEGORIES],
      max_probes_per_evaluation: MAX_PROBES_PER_EVALUATION,
      caveat: 'Una conexión aceptada no prueba que exista una vulnerabilidad.',
      max_addresses_per_scan: 254,
      allowed_ports: [...PILOT_PORTS],
    };
  }
}
