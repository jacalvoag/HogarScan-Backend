import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { PasswordHasher } from '../../application/ports/password-hasher.port.js';

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19 * 1024,
      timeCost: 2,
      parallelism: 1,
      hashLength: 32,
    });
  }

  verify(password: string, encodedHash: string): Promise<boolean> {
    return argon2.verify(encodedHash, password);
  }
}
