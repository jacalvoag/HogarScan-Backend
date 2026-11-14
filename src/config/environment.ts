import { isIP } from 'node:net';

export interface Environment {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  API_HOST: string;
}

export function validateEnvironment(
  values: Record<string, unknown>,
): Environment {
  const nodeEnv =
    values.NODE_ENV === undefined ? 'development' : values.NODE_ENV;

  if (
    nodeEnv !== 'development' &&
    nodeEnv !== 'test' &&
    nodeEnv !== 'production'
  ) {
    throw new Error('NODE_ENV debe ser development, test o production.');
  }

  const rawPort = values.PORT === undefined ? '3000' : values.PORT;
  const port = typeof rawPort === 'string' ? Number(rawPort) : Number.NaN;

  if (
    typeof rawPort !== 'string' ||
    rawPort.length === 0 ||
    /[^0-9]/.test(rawPort) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error('PORT debe ser un entero entre 1 y 65535.');
  }

  const host = values.API_HOST === undefined ? '0.0.0.0' : values.API_HOST;

  if (typeof host !== 'string' || isIP(host) === 0) {
    throw new Error('API_HOST debe ser una dirección IPv4 o IPv6 literal.');
  }

  return { ...values, NODE_ENV: nodeEnv, PORT: port, API_HOST: host };
}
