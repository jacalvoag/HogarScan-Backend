import { CheckKevMembership } from './check-kev-membership.js';
import type { KevCatalogSource } from './ports/vulnerability-sources.js';

describe('CheckKevMembership', () => {
  const date = new Date('2026-11-11T00:00:00Z');
  const signal = new AbortController().signal;
  const load = vi.fn<KevCatalogSource['load']>();
  const check = new CheckKevMembership({ load }, () => date);
  beforeEach(() => {
    load.mockReset();
  });

  it('does not query KEV when there is no substantiated CVE', async () => {
    await expect(check.execute(undefined, signal)).resolves.toEqual({
      state: 'NOT_QUERIED',
      checkedAt: null,
      inKev: null,
    });
    expect(load).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'reports %s only after a successful catalog check',
    async (inKev) => {
      load.mockResolvedValueOnce({
        catalogVersion: 'test',
        dateReleased: '2026-11-11T00:00:00Z',
        contains: () => inKev,
      });
      await expect(check.execute('CVE-2026-1234', signal)).resolves.toEqual({
        state: 'AVAILABLE',
        checkedAt: date,
        inKev,
      });
      expect(load).toHaveBeenCalledExactlyOnceWith(signal);
    },
  );

  it('does not treat provider errors as an absent CVE', async () => {
    load.mockRejectedValueOnce(new Error('PRIVATE_PROVIDER_DETAIL'));
    await expect(check.execute('CVE-2026-1234', signal)).resolves.toEqual({
      state: 'UNAVAILABLE',
      checkedAt: date,
      inKev: null,
    });
  });

  it('rejects invalid identifiers and propagates cancellation', async () => {
    await expect(check.execute('bad', signal)).rejects.toThrow(
      'Invalid CVE identifier',
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      check.execute('CVE-2026-1234', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(load).not.toHaveBeenCalled();
  });

  it('does not return success if cancellation happens during loading', async () => {
    const controller = new AbortController();
    load.mockImplementationOnce(async () => {
      controller.abort();
      return {
        catalogVersion: 'test',
        dateReleased: '2026-11-11T00:00:00Z',
        contains: () => true,
      };
    });
    await expect(
      check.execute('CVE-2026-1234', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
