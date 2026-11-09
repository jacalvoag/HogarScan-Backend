import { Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import type { DatabaseConfig } from '../../config/database.config.js';

export async function createPostgresPool(
  config: DatabaseConfig,
): Promise<Pool> {
  const ca = await readFile(config.caPath, 'utf8');
  const logger = new Logger('PostgresPool');

  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    application_name: 'hogarscan-api',
    max: 3,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    ssl: {
      ca,
      rejectUnauthorized: true,
      servername: config.host,
      minVersion: 'TLSv1.2',
    },
  });

  pool.on('error', () => {
    logger.error('Se perdió una conexión inactiva con PostgreSQL.');
  });

  try {
    await pool.query('SELECT 1');
    return pool;
  } catch (error) {
    await pool.end();
    throw error;
  }
}
