import { isUtf8 } from 'node:buffer';
import { BadRequestException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, RequestHandler } from 'express';

export const requireValidUtf8: RequestHandler = (
  req: RawBodyRequest<Request>,
  _res,
  next,
) => {
  if (req.rawBody !== undefined && !isUtf8(req.rawBody)) {
    next(new BadRequestException());
    return;
  }

  next();
};