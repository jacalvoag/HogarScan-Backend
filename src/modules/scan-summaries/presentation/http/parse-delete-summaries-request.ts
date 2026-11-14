import { BadRequestException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

export function parseDeleteSummariesRequest(
  request: RawBodyRequest<Request>,
): number {
  const separator = request.originalUrl.indexOf('?');

  const query = new URLSearchParams(
    separator === -1 ? '' : request.originalUrl.slice(separator + 1),
  );

  const values = query.getAll('summary_generation');

  if (
    (request.rawBody?.length ?? 0) > 0 ||
    values.length !== 1 ||
    [...query.keys()].some((key) => key !== 'summary_generation')
  ) {
    throw new BadRequestException();
  }

  const value = values[0];

  if (value.length === 0 || /[^0-9]/.test(value)) {
    throw new BadRequestException();
  }

  const generation = Number(value);

  if (!Number.isInteger(generation) || generation > 2_147_483_647) {
    throw new BadRequestException();
  }

  return generation;
}
