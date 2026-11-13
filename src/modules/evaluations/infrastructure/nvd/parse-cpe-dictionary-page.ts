import { z } from 'zod';
import type { CpeDictionaryPage } from '../../application/ports/cpe-dictionary.js';

const nvdDate = z.iso.datetime({ offset: true, local: true });
// Check the formatted-string envelope without interpreting escaped attributes.
function hasCpeEnvelope(value: string): boolean {
  if (!value.startsWith('cpe:2.3:')) return false;
  let fields = 1;
  let fieldLength = 0;
  let escaped = false;
  for (const char of value.slice('cpe:2.3:'.length)) {
    if (!/^[\x21-\x7e]$/.test(char)) return false;
    if (escaped) {
      escaped = false;
      fieldLength++;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === ':') {
      if (fieldLength === 0) return false;
      fields++;
      fieldLength = 0;
    } else {
      fieldLength++;
    }
  }
  return !escaped && fields === 11 && fieldLength > 0;
}
const cpeName = z.string().refine(hasCpeEnvelope);
const record = z.object({
  cpeName,
  cpeNameId: z.guid(),
  deprecated: z.boolean(),
  created: nvdDate,
  lastModified: nvdDate,
  titles: z.array(z.object({ title: z.string(), lang: z.string() })).optional(),
  deprecatedBy: z.array(z.object({ cpeName, cpeNameId: z.guid() })).optional(),
});
const response = z
  .object({
    resultsPerPage: z.number().int().nonnegative(),
    startIndex: z.number().int().nonnegative(),
    totalResults: z.number().int().nonnegative(),
    format: z.literal('NVD_CPE'),
    version: z.literal('2.0'),
    timestamp: nvdDate,
    products: z.array(z.object({ cpe: record })),
  })
  .superRefine((page, context) => {
    const ids = page.products.map(({ cpe }) => cpe.cpeNameId.toLowerCase());
    if (
      ids.length > page.resultsPerPage ||
      (ids.length === 0 && page.startIndex < page.totalResults) ||
      (ids.length > 0 && page.startIndex + ids.length > page.totalResults) ||
      new Set(ids).size !== ids.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Inconsistent CPE dictionary page',
      });
    }
  });

/** Parses search candidates only; the CPE name is not matched to a device. */
export function parseCpeDictionaryPage(payload: unknown): CpeDictionaryPage {
  const result = response.safeParse(payload);
  if (!result.success) throw new Error('Invalid CPE dictionary response');
  const page = result.data;
  return {
    startIndex: page.startIndex,
    resultsPerPage: page.resultsPerPage,
    totalResults: page.totalResults,
    candidates: page.products.map(({ cpe }) => ({
      id: cpe.cpeNameId,
      name: cpe.cpeName,
      deprecated: cpe.deprecated,
      titles: (cpe.titles ?? []).map(({ title, lang }) => ({
        text: title,
        language: lang,
      })),
      replacementIds: (cpe.deprecatedBy ?? []).map(
        ({ cpeNameId }) => cpeNameId,
      ),
    })),
  };
}
