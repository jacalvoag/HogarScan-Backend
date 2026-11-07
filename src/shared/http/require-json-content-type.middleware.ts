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

  if (
    jsonType === null ||
    (jsonType !== false &&
      isSupportedContentType(req.get('Content-Type') ?? ''))
  ) {
    next();
    return;
  }

  next(new UnsupportedMediaTypeException());
};