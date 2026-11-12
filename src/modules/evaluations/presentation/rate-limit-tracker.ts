import { normalizeIp } from '@nestjs/throttler';

/** Keep IPv6 hosts distinct while normalizing equivalent address forms. */
export function trackClientIp(request: Record<string, unknown>): string {
  return typeof request.ip === 'string'
    ? normalizeIp(request.ip, 128)
    : 'unknown';
}
