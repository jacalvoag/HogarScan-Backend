import { z } from 'zod';
import type { NvdCandidatePage } from '../../application/ports/vulnerability-sources.js';

const cveId = z.string().regex(/^CVE-[0-9]{4}-[0-9]{4,}$/);
const nvdDate = z.iso.datetime({ offset: true, local: true });
const candidate = z.object({
  id: cveId,
  published: nvdDate,
  lastModified: nvdDate,
  descriptions: z
    .array(z.object({ lang: z.string(), value: z.string().max(4096) }))
    .min(1),
  references: z.array(z.object({ url: z.url() })),
});
const nvdPage = z
  .object({
    resultsPerPage: z.number().int().nonnegative(),
    startIndex: z.number().int().nonnegative(),
    totalResults: z.number().int().nonnegative(),
    format: z.literal('NVD_CVE'),
    version: z.literal('2.0'),
    timestamp: nvdDate,
    vulnerabilities: z.array(z.object({ cve: candidate })),
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
