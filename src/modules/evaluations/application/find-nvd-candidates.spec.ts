import { FindNvdCandidates } from './find-nvd-candidates.js';
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
    search.mockResolvedValueOnce(page);
    await expect(lookup.execute(identification, signal)).resolves.toEqual({
      state: 'AVAILABLE',
      checkedAt: date,
      page,
    });
    expect(search).toHaveBeenCalledExactlyOnceWith(identification, 0, signal);
    search.mockRejectedValueOnce(new Error('PRIVATE_PROVIDER_DETAIL'));
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
});
