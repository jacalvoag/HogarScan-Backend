import { SaveScanSummary } from './save-scan-summary.js';
import type {
  SaveSummaryResult,
  ScanSummaryWriter,
} from './ports/scan-summary-writer.port.js';
import { InvalidScanSummaryError } from '../domain/scan-summary.js';
import type { ScanSummary } from '../domain/scan-summary.js';

describe('SaveScanSummary', () => {
  const userId = '6ba63463-9073-43d1-9b60-2fd868798cc0';

  const input: ScanSummary = {
    scanId: '6CE5E6B1-9509-48A7-BC9D-F0F872364726',
    summaryGeneration: 0,
    startedAt: '2026-11-10T16:00:00Z',
    finishedAt: '2026-11-10T16:01:00.1Z',
    addressesScanned: 5,
    addressesResponded: 2,
    acceptedServices: 3,
    findingsByCategory: {
      TCP_SERVICE_ACCESSIBLE: 3,
      PROTOCOL_IDENTIFIED: 1,
      PREVENTIVE_REVIEW: 0,
      POSSIBLE_CVE_MATCH: 0,
      INSUFFICIENT_EVIDENCE: 4,
    },
  };

  const save = vi.fn<ScanSummaryWriter['save']>();
  const useCase = new SaveScanSummary({ save });

  const result: SaveSummaryResult = {
    status: 'SAVED',
    receipt: {
      scanId: input.scanId.toLowerCase(),
      summaryGeneration: 0,
      receivedAt: new Date('2026-11-10T16:02:00.000Z'),
      created: false,
    },
  };

  beforeEach(() => {
    save.mockReset();
  });

  it('passes canonical data and preserves the writer receipt', async () => {
    save.mockResolvedValueOnce(result);

    await expect(useCase.execute(userId, input)).resolves.toBe(result);

    expect(save).toHaveBeenCalledExactlyOnceWith(userId, {
      ...input,
      scanId: '6ce5e6b1-9509-48a7-bc9d-f0f872364726',
      startedAt: '2026-11-10T16:00:00.000Z',
      finishedAt: '2026-11-10T16:01:00.100Z',
    });

    expect(input.startedAt).toBe('2026-11-10T16:00:00Z');
  });

  it('rejects invalid domain data before calling persistence', async () => {
    await expect(
      useCase.execute(userId, { ...input, acceptedServices: 13 }),
    ).rejects.toBeInstanceOf(InvalidScanSummaryError);

    expect(save).not.toHaveBeenCalled();
  });

  it('propagates a persistence failure without reporting success', async () => {
    const error = new Error('Database unavailable');
    save.mockRejectedValueOnce(error);

    await expect(useCase.execute(userId, input)).rejects.toBe(error);
  });
});
