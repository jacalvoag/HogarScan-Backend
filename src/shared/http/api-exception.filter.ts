import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { ApiError } from './api-error.js';

const invalidRequest: ApiError = {
  code: 'INVALID_REQUEST',
  message: 'Revisa los datos enviados.',
};
const internalError: ApiError = {
  code: 'INTERNAL_ERROR',
  message: 'No se pudo completar la solicitud.',
};
const responses = new Map<number, ApiError>([
  [HttpStatus.BAD_REQUEST, invalidRequest],
  [HttpStatus.INTERNAL_SERVER_ERROR, internalError],
  [
    HttpStatus.UNAUTHORIZED,
    { code: 'UNAUTHENTICATED', message: 'Inicia sesión de nuevo.' },
  ],
  [
    HttpStatus.NOT_FOUND,
    { code: 'INVALID_REQUEST', message: 'La ruta solicitada no existe.' },
  ],
  [
    HttpStatus.PAYLOAD_TOO_LARGE,
    { code: 'PAYLOAD_TOO_LARGE', message: 'La solicitud es demasiado grande.' },
  ],
  [
    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    {
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Formato de solicitud no admitido.',
    },
  ],
  [
    HttpStatus.TOO_MANY_REQUESTS,
    { code: 'RATE_LIMITED', message: 'Inténtalo más tarde.' },
  ],
  [
    HttpStatus.SERVICE_UNAVAILABLE,
    {
      code: 'SERVICE_UNAVAILABLE',
      message: 'Servicio temporalmente no disponible.',
    },
  ],
]);

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body =
      responses.get(status) ??
      (status >= HttpStatus.INTERNAL_SERVER_ERROR
        ? internalError
        : invalidRequest);
    const response = host.switchToHttp().getResponse<unknown>();
    const { httpAdapter } = this.adapterHost;

    // No se publican mensajes, cuerpos ni causas de la excepción original.
    httpAdapter.setHeader(response, 'Cache-Control', 'no-store');
    if (status === HttpStatus.UNAUTHORIZED) {
      httpAdapter.setHeader(response, 'WWW-Authenticate', 'Bearer');
    }
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`Error HTTP ${status} al procesar una solicitud.`);
    }
    httpAdapter.reply(response, body, status);
  }
}
