import { BadRequestException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, RequestHandler } from 'express';
import { createScanner } from 'jsonc-parser';

function hasDuplicateKeys(json: string): boolean {
  const scanner = createScanner(json, true);
  const objects: Set<string>[] = [];
  let lastString = '';

  // El parser JSON anterior ya comprobó la sintaxis.
  for (scanner.scan(); scanner.getTokenLength() > 0; scanner.scan()) {
    const marker = json[scanner.getTokenOffset()];

    if (marker === '{') {
      objects.push(new Set());
    } else if (marker === '}') {
      objects.pop();
    } else if (marker === '"') {
      lastString = scanner.getTokenValue();
    } else if (marker === ':') {
      const keys = objects.at(-1);
      if (keys?.has(lastString)) {
        return true;
      }
      keys?.add(lastString);
    }
  }

  return false;
}

export const requireUniqueJsonKeys: RequestHandler = (
  req: RawBodyRequest<Request>,
  _res,
  next,
) => {
  if (
    req.rawBody !== undefined &&
    hasDuplicateKeys(req.rawBody.toString('utf8'))
  ) {
    next(new BadRequestException());
    return;
  }

  next();
};