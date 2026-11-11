import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiError } from './api-error.js';

const definitions = {
  EMAIL_ALREADY_REGISTERED: {
    status: HttpStatus.CONFLICT,
    message: 'El correo no está disponible.',
  },
  INVALID_CREDENTIALS: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'No se pudo iniciar sesión.',
  },
} as const;

export class ApiException extends HttpException {
  readonly publicBody: ApiError;

  constructor(code: keyof typeof definitions) {
    const definition = definitions[code];
    const body: ApiError = { code, message: definition.message };

    super(body, definition.status);
    this.publicBody = body;
  }
}
