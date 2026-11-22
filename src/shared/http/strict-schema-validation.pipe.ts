import { isDeepStrictEqual } from 'node:util';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';

@Injectable()
export class StrictSchemaValidationPipe implements PipeTransform {
  async transform(
    value: unknown,
    metadata: ArgumentMetadata,
  ): Promise<unknown> {
    const { schema } = metadata;
    if (schema === undefined) {
      return value;
    }

    const result = await schema['~standard'].validate(value);
    if (result.issues || !isDeepStrictEqual(value, result.value)) {
      throw new BadRequestException();
    }

    return value;
  }
}