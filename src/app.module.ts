import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnvironment } from './config/environment.js';
import { ApiExceptionFilter } from './shared/http/api-exception.filter.js';
import { StrictSchemaValidationPipe } from './shared/http/strict-schema-validation.pipe.js';
import { DatabaseModule } from './shared/database/database.module.js';
import { AuthModule } from './modules/auth/auth.public.js';
import { EvaluationsModule } from './modules/evaluations/evaluations.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    DatabaseModule,
    AuthModule,
    EvaluationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_PIPE, useClass: StrictSchemaValidationPipe },
  ],
})
export class AppModule {}
