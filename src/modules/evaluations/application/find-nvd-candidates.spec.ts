import { FindNvdCandidates } from './find-nvd-candidates.js';
import { ExternalSourceError } from './ports/external-source-result.js';
import type { NvdCandidateSource } from './ports/vulnerability-sources.js';

describe('FindNvdCandidates', () => {
  const identification = {
    vendor: 'Example',
    product: 'Device',
    version: '1.0',
    source: 'USER_DEVICE_LABEL',
  } as const;
  const date = new Date('2026-11-11T00:00:00.000Z');
  const signal = new AbortController().signal;
  const search = vi.fn<NvdCandidateSource['search']>();
  const lookup = new FindNvdCandidates({ search }, () => date);
  beforeEach(() => {
    search.mockReset();
  });

  it('does not query without a declared identification', async () => {
    await expect(lookup.execute(undefined, signal)).resolves.toEqual({
      state: 'NOT_QUERIED',
      checkedAt: null,
    });
    expect(search).not.toHaveBeenCalled();
  });

  it('distinguishes a successful empty page from a source failure', async () => {
    const page = {
      startIndex: 0,
      resultsPerPage: 0,
      totalResults: 0,
      candidates: [],
    };
    const original = new Date('2026-11-10T00:00:00.000Z');
    search.mockResolvedValueOnce({ value: page, obtainedAt: original });
    await expect(lookup.execute(identification, signal)).resolves.toEqual({
      state: 'AVAILABLE',
      checkedAt: original,
      page,
    });
    expect(search).toHaveBeenCalledExactlyOnceWith(identification, 0, signal);
    search.mockRejectedValueOnce(new ExternalSourceError('UNAVAILABLE'));
    await expect(lookup.execute(identification, signal)).resolves.toEqual({
      state: 'UNAVAILABLE',
      checkedAt: date,
    });
  });

  it('propagates cancellation instead of reporting a provider failure', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      lookup.execute(identification, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(search).not.toHaveBeenCalled();
  });

  it('does not return a page after cancellation during a lookup', async () => {
    const controller = new AbortController();
    search.mockImplementationOnce(async () => {
      controller.abort();
      return {
        value: {
          startIndex: 0,
          resultsPerPage: 0,
          totalResults: 0,
          candidates: [],
        },
        obtainedAt: date,
      };
    });
    await expect(
      lookup.execute(identification, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('propagates programming errors rather than treating them as provider failures', async () => {
    search.mockRejectedValueOnce(new Error('bug'));
    await expect(lookup.execute(identification, signal)).rejects.toThrow('bug');
  });
});
