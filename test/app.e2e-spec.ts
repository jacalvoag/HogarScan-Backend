import type { TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import {
  externalSourcesConfig,
  validateExternalSourcesEnvironment,
} from '../src/config/external-sources.config.js';
import type { ExternalSourcesConfig } from '../src/config/external-sources.config.js';
import { createHttpTestModule } from './helpers/create-http-test-module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await createHttpTestModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('provides the validated external sources configuration from AppModule', () => {
    expect(app.get<ExternalSourcesConfig>(externalSourcesConfig.KEY)).toEqual(
      validateExternalSourcesEnvironment(process.env),
    );
  });

  afterEach(async () => {
    await app.close();
  });
});
