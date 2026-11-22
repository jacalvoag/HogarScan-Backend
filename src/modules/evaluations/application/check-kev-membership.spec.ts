import { CheckKevMembership } from './check-kev-membership.js';
import { ExternalSourceError } from './ports/external-source-result.js';
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
      const original = new Date('2026-11-10T00:00:00Z');
      load.mockResolvedValueOnce({
        obtainedAt: original,
        value: {
          catalogVersion: 'test',
          dateReleased: '2026-11-11T00:00:00Z',
          contains: () => inKev,
        },
      });
      await expect(check.execute('CVE-2026-1234', signal)).resolves.toEqual({
        state: 'AVAILABLE',
        checkedAt: original,
        inKev,
      });
      expect(load).toHaveBeenCalledExactlyOnceWith(signal);
    },
  );

  it('does not treat provider errors as an absent CVE', async () => {
    load.mockRejectedValueOnce(new ExternalSourceError('UNAVAILABLE'));
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
        obtainedAt: date,
        value: {
          catalogVersion: 'test',
          dateReleased: '2026-11-11T00:00:00Z',
          contains: () => true,
        },
      };
    });
    await expect(
      check.execute('CVE-2026-1234', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('propagates programming errors without presenting a false provider failure', async () => {
    load.mockRejectedValueOnce(new Error('bug'));
    await expect(check.execute('CVE-2026-1234', signal)).rejects.toThrow('bug');
  });
});
