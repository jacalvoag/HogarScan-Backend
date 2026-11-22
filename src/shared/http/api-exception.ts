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
  SUMMARY_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'La revisión ya existe con un contenido diferente.',
  },
  STALE_SUMMARY_GENERATION: {
    status: HttpStatus.CONFLICT,
    message: 'El resumen pertenece a una generación de estadísticas anterior.',
  },
  INVALID_SUMMARY_GENERATION: {
    status: HttpStatus.CONFLICT,
    message: 'La generación enviada no es válida.',
  },
} as const;

type GenerationCode = 'STALE_SUMMARY_GENERATION' | 'INVALID_SUMMARY_GENERATION';

type ExceptionArguments =
  | [code: Exclude<keyof typeof definitions, GenerationCode>]
  | [code: GenerationCode, currentGeneration: number];

export class ApiException extends HttpException {
  readonly publicBody: ApiError;

  constructor(...args: ExceptionArguments) {
    const [code, currentGeneration] = args;
    const definition = definitions[code];
    const body: ApiError = { code, message: definition.message };

    if (
      code === 'STALE_SUMMARY_GENERATION' ||
      code === 'INVALID_SUMMARY_GENERATION'
    ) {
      if (
        typeof currentGeneration !== 'number' ||
        !Number.isInteger(currentGeneration) ||
        currentGeneration < 0 ||
        currentGeneration > 2_147_483_647
      ) {
        throw new RangeError('Invalid current summary generation.');
      }

      body.details = {
        current_summary_generation: currentGeneration,
      };
    }

    super(body, definition.status);
    this.publicBody = body;
  }
}
