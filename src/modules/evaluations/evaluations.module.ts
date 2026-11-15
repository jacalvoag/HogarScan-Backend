import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.public.js';
import { EvaluateBasic } from './application/evaluate-basic.js';
import { EvaluationsController } from './presentation/evaluations.controller.js';
import { RulesController } from './presentation/rules.controller.js';
import { externalSourcesConfig } from '../../config/external-sources.config.js';
import type { ExternalSourcesConfig } from '../../config/external-sources.config.js';
import { EvaluateWithSources } from './application/evaluate-with-sources.js';
import { ExternalJsonCache } from './infrastructure/http/external-json-cache.js';
import { ExternalJsonGateway } from './infrastructure/http/external-json-gateway.js';
import { ExternalScheduler } from './infrastructure/http/external-scheduler.js';
import { ExternalSourceClients } from './infrastructure/http/external-source-clients.js';
import { ExternalTransport } from './infrastructure/http/external-transport.js';

@Module({
  imports: [AuthModule],
  controllers: [RulesController, EvaluationsController],
  providers: [
    { provide: EvaluateBasic, useFactory: () => new EvaluateBasic() },
    {
      provide: ExternalSourceClients,
      inject: [externalSourcesConfig.KEY],
      useFactory: (config: ExternalSourcesConfig) => {
        const cache = new ExternalJsonCache(config);
        const scheduler = new ExternalScheduler(config);
        const transport = new ExternalTransport(config);
        return new ExternalSourceClients(
          new ExternalJsonGateway(config.enabled, cache, scheduler, transport),
          config,
        );
      },
    },
    {
      provide: EvaluateWithSources,
      inject: [EvaluateBasic, ExternalSourceClients, externalSourcesConfig.KEY],
      useFactory: (
        basic: EvaluateBasic,
        source: ExternalSourceClients,
        config: ExternalSourcesConfig,
      ) => new EvaluateWithSources(basic, source, config),
    },
  ],
})
export class EvaluationsModule {}
