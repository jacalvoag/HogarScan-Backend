import { createHash } from 'node:crypto';
import type { SessionTokenHasher } from '../../application/ports/session-token-hasher.port.js';

export class Sha256SessionTokenHasher implements SessionTokenHasher {
  hash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
