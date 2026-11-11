import { MIMEType } from 'node:util';
import { UnsupportedMediaTypeException } from '@nestjs/common';
import type { RequestHandler } from 'express';

function isSupportedContentType(value: string): boolean {
  try {
    const contentType = new MIMEType(value);
    const charset = contentType.params.get('charset') ?? 'utf-8';

    return (
      contentType.essence === 'application/json' &&
      charset.toLowerCase() === 'utf-8'
    );
  } catch {
    return false;
  }
}

export const requireJsonContentType: RequestHandler = (req, _res, next) => {
  const jsonType = req.is('application/json');
  const emptyBody =
    req.get('Content-Length') === '0' &&
    req.get('Transfer-Encoding') === undefined;

  if (
    emptyBody ||
    jsonType === null ||
    (jsonType !== false &&
      isSupportedContentType(req.get('Content-Type') ?? ''))
  ) {
    next();
    return;
  }

  next(new UnsupportedMediaTypeException());
};
