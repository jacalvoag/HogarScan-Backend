import { trackClientIp } from './rate-limit-tracker.js';

describe('Evaluation rate-limit tracker', () => {
  it('distinguishes IPv6 addresses within the same subnet', () => {
    expect(trackClientIp({ ip: '2001:db8::2' })).not.toBe(
      trackClientIp({ ip: '2001:db8::3' }),
    );
    expect(trackClientIp({ ip: '2001:0db8::2' })).toBe(
      trackClientIp({ ip: '2001:db8::2' }),
    );
  });

  it('normalizes IPv4-mapped addresses', () => {
    expect(trackClientIp({ ip: '::ffff:192.0.2.1' })).toBe(
      trackClientIp({ ip: '192.0.2.1' }),
    );
  });
});
