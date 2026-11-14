import SwaggerParser from '@apidevtools/swagger-parser';
import { resolve } from 'node:path';

const file = resolve(import.meta.dirname, '../docs/hogarscan_openapi.yaml');

try {
  const api = await SwaggerParser.validate(file, {
    resolve: { http: false },
  });

  console.log(`OpenAPI válido: ${api.info.title} (${api.openapi}).`);
} catch (error) {
  console.error('Contrato OpenAPI inválido.');
  console.error(error.message);
  process.exitCode = 1;
}
