export interface Environment {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
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
    !/^\d+$/.test(rawPort) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error('PORT debe ser un entero entre 1 y 65535.');
  }

  return { ...values, NODE_ENV: nodeEnv, PORT: port };
}
