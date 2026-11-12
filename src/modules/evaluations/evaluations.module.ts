import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.public.js';
import { EvaluateBasic } from './application/evaluate-basic.js';
import { EvaluationsController } from './presentation/evaluations.controller.js';
import { RulesController } from './presentation/rules.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [RulesController, EvaluationsController],
  providers: [
    { provide: EvaluateBasic, useFactory: () => new EvaluateBasic() },
  ],
})
export class EvaluationsModule {}
