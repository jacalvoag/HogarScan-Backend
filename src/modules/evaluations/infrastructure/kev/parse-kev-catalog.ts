import { z } from 'zod';
import type { KevCatalog } from '../../application/ports/vulnerability-sources.js';

const cveId = z.string().regex(/^CVE-[0-9]{4}-[0-9]{4,}(?![\s\S])/);
const catalogEntry = z.object({
  cveID: z.string().regex(/^CVE-[0-9]{4}-[0-9]{4,19}(?![\s\S])/),
  vendorProject: z.string(),
  product: z.string(),
  vulnerabilityName: z.string(),
  dateAdded: z.iso.date(),
  shortDescription: z.string(),
  requiredAction: z.string(),
  dueDate: z.iso.date(),
  knownRansomwareCampaignUse: z.string().optional(),
  forensicTriage: z.string().optional(),
  notes: z.string().optional(),
  cwes: z.array(z.string().regex(/^CWE-[0-9]+$/)).optional(),
});
const catalogSchema = z
  .object({
    catalogVersion: z.string().min(1),
    dateReleased: z.iso.datetime({ offset: true }),
    count: z.number().int().positive(),
    vulnerabilities: z.array(catalogEntry).min(1),
  })
  .superRefine((catalog, context) => {
    const ids = catalog.vulnerabilities.map(({ cveID }) => cveID);
    if (catalog.count !== ids.length || new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        message: 'Incomplete or duplicate KEV catalog',
      });
    }
  });

/** A malformed or incomplete catalog must never be interpreted as an empty one. */
export function parseKevCatalog(payload: unknown): KevCatalog {
  const result = catalogSchema.safeParse(payload);
  if (!result.success) throw new Error('Invalid KEV catalog');
  const { catalogVersion, dateReleased, vulnerabilities } = result.data;
  const ids = new Set(vulnerabilities.map(({ cveID }) => cveID));
  return {
    catalogVersion,
    dateReleased,
    contains(cve: string): boolean {
      if (!cveId.safeParse(cve).success)
        throw new Error('Invalid CVE identifier');
      return ids.has(cve);
    },
  };
}
