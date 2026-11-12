import { z } from 'zod';
import type { NvdCandidatePage } from '../../application/ports/vulnerability-sources.js';

const cveId = z.string().regex(/^CVE-[0-9]{4}-[0-9]{4,}$/);
const nvdPage = z
  .object({
    resultsPerPage: z.number().int().nonnegative(),
    startIndex: z.number().int().nonnegative(),
    totalResults: z.number().int().nonnegative(),
    format: z.literal('NVD_CVE'),
    version: z.literal('2.0'),
    timestamp: z.iso.datetime({ offset: true, local: true }),
    vulnerabilities: z.array(z.object({ cve: z.object({ id: cveId }) })),
  })
  .superRefine((page, context) => {
    const ids = page.vulnerabilities.map(({ cve }) => cve.id);
    if (
      ids.length > page.resultsPerPage ||
      (ids.length > 0 && page.startIndex + ids.length > page.totalResults) ||
      new Set(ids).size !== ids.length
    ) {
      context.addIssue({ code: 'custom', message: 'Inconsistent NVD page' });
    }
  });

/** Parses candidate identifiers only; it does not assess applicability. */
export function parseNvdPage(payload: unknown): NvdCandidatePage {
  const result = nvdPage.safeParse(payload);
  if (!result.success) throw new Error('Invalid NVD response');
  const page = result.data;
  return {
    startIndex: page.startIndex,
    resultsPerPage: page.resultsPerPage,
    totalResults: page.totalResults,
    candidates: page.vulnerabilities.map(({ cve }) => ({ cve: cve.id })),
  };
}
