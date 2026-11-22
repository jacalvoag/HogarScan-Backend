import { parseCpeDictionaryPage } from '../infrastructure/nvd/parse-cpe-dictionary-page.js';
import { collectCpePages } from './collect-cpe-pages.js';

describe('Synthetic CPE dictionary pages', () => {
  const response = {
    resultsPerPage: 1,
    startIndex: 0,
    totalResults: 2,
    format: 'NVD_CPE',
    version: '2.0',
    timestamp: '2026-11-12T00:00:00.000',
  };
  const base = {
    deprecated: false,
    created: '2026-11-12T00:00:00.000',
    lastModified: '2026-11-12T00:00:00.000',
  };

  it('preserves all candidates while distinguishing partial and complete pages', () => {
    const first = parseCpeDictionaryPage({
      ...response,
      products: [
        {
          cpe: {
            ...base,
            cpeName: 'cpe:2.3:h:example:router:1.0:*:*:*:*:*:*:*',
            cpeNameId: '00000000-0000-4000-8000-000000000001',
          },
        },
      ],
    });
    const second = parseCpeDictionaryPage({
      ...response,
      startIndex: 1,
      products: [
        {
          cpe: {
            ...base,
            deprecated: true,
            cpeName: 'cpe:2.3:h:example:router:2.0:*:*:*:*:*:*:*',
            cpeNameId: '00000000-0000-4000-8000-000000000002',
          },
        },
      ],
    });
    expect(collectCpePages([first]).state).toBe('PAGES_PARTIAL');
    const complete = collectCpePages([first, second]);
    expect(complete.state).toBe('PAGES_COMPLETE');
    expect(complete.candidates.map(({ deprecated }) => deprecated)).toEqual([
      false,
      true,
    ]);
    expect(complete.candidates).toHaveLength(2);
  });
});
