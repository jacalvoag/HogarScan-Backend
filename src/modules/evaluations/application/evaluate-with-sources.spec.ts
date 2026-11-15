import { EvaluateBasic } from './evaluate-basic.js';
import { EvaluateWithSources } from './evaluate-with-sources.js';
import { ExternalSourceError } from './ports/external-source-result.js';
import type { EvaluationInput } from '../domain/evaluation-input.js';
import type { NvdCandidate } from './ports/vulnerability-sources.js';
import { parseNvdPage } from '../infrastructure/nvd/parse-nvd-page.js';

const input: EvaluationInput = {
  observations: [{ port: 22, outcome: 'ACCEPTED' }],
  identification: {
    vendor: 'Example',
    product: 'Device',
    version: '1',
    source: 'USER_DEVICE_LABEL',
  },
};
const signal = () => new AbortController().signal;
const cpe = 'cpe:2.3:h:example:device:1:*:*:*:*:*:*:*';
const criterion = {
  vulnerable: true,
  criteria: cpe,
  matchCriteriaId: 'example-match',
};
function nvdCandidate(cve: string): NvdCandidate {
  return {
    cve,
    status: 'Analyzed',
    hasUnparsedAffectedData: false,
    configurations: [{ nodes: [{ operator: 'OR', cpeMatch: [criterion] }] }],
  };
}

describe('evaluación con fuentes externas', () => {
  const at = new Date('2026-01-01T00:00:00.000Z');
  const basic = new EvaluateBasic(() => at);
  const config = { enabled: true, evaluationBudgetMs: 1000 };
  const sourceMocks = () => ({
    searchCpe: vi.fn().mockResolvedValue({
      obtainedAt: at,
      value: [
        {
          id: 'candidate',
          name: cpe,
          deprecated: false,
          titles: [],
          replacementIds: [],
        },
      ],
    }),
    searchCve: vi.fn().mockResolvedValue({ obtainedAt: at, value: [] }),
    loadKev: vi.fn(),
  });

  it('evita consultas con fuentes deshabilitadas o sin datos comparables', async () => {
    const source = sourceMocks();
    const disabled = new EvaluateWithSources(basic, source, {
      enabled: false,
      evaluationBudgetMs: 1000,
    });
    const enabled = new EvaluateWithSources(basic, source, {
      enabled: true,
      evaluationBudgetMs: 1000,
    });
    expect((await disabled.execute(input, signal())).sources.nvd).toBe(
      'NOT_QUERIED',
    );
    expect(
      (await enabled.execute({ observations: input.observations }, signal()))
        .sources.nvd,
    ).toBe('NOT_QUERIED');
    const identification = {
      vendor: 'Example',
      product: 'Device Pro',
      version: '1',
      source: 'USER_DEVICE_LABEL',
    } as const;
    expect(
      (await enabled.execute({ ...input, identification }, signal())).sources
        .nvd,
    ).toBe('NOT_QUERIED');
    expect(source.searchCpe).not.toHaveBeenCalled();
  });

  it('conserva la fecha original y no consulta CVE con un CPE ambiguo', async () => {
    const source = sourceMocks();
    source.searchCpe.mockResolvedValue({
      value: [{ name: cpe }, { name: cpe.replace(':h:', ':a:') }],
      obtainedAt: at,
    });
    const service = new EvaluateWithSources(basic, source, config);
    const result = await service.execute(input, signal());
    expect(result.sources).toEqual({
      nvd: 'AVAILABLE',
      kev: 'NOT_QUERIED',
      checkedAt: at.toISOString(),
    });
    expect(result.possibleCveMatches).toEqual([]);
    expect(result.findings).toEqual(basic.execute(input).findings);
    expect(source.searchCve).not.toHaveBeenCalled();
    expect(source.loadKev).not.toHaveBeenCalled();
  });

  it('distingue un fallo externo de una búsqueda sin resultados', async () => {
    const source = sourceMocks();
    source.searchCpe.mockRejectedValue(new ExternalSourceError('UNAVAILABLE'));
    const service = new EvaluateWithSources(
      basic,
      source,
      { enabled: true, evaluationBudgetMs: 1000 },
      () => 0,
      () => at,
    );
    expect((await service.execute(input, signal())).sources).toEqual({
      nvd: 'UNAVAILABLE',
      kev: 'NOT_QUERIED',
      checkedAt: at.toISOString(),
    });
  });

  it('propaga errores de programación y desconexiones', async () => {
    const error = new Error('programming error');
    const source = sourceMocks();
    source.searchCpe.mockRejectedValue(error);
    const service = new EvaluateWithSources(basic, source, {
      enabled: true,
      evaluationBudgetMs: 1000,
    });
    await expect(service.execute(input, signal())).rejects.toBe(error);
    const client = new AbortController();
    client.abort(error);
    await expect(service.execute(input, client.signal)).rejects.toBe(error);
  });

  it('convierte el vencimiento del presupuesto en fuente no disponible', async () => {
    vi.useFakeTimers();
    try {
      const searchCpe = vi.fn(
        (_input, externalSignal: AbortSignal) =>
          new Promise<never>((_resolve, reject) =>
            externalSignal.addEventListener(
              'abort',
              () => reject(externalSignal.reason),
              { once: true },
            ),
          ),
      );
      const service = new EvaluateWithSources(
        basic,
        { ...sourceMocks(), searchCpe },
        { enabled: true, evaluationBudgetMs: 1000 },
      );
      const result = service.execute(input, signal());
      await vi.advanceTimersByTimeAsync(1000);
      expect((await result).sources.nvd).toBe('UNAVAILABLE');
    } finally {
      vi.useRealTimers();
    }
  });

  it('separa las fechas de procedencia y comprueba varias CVE con un catálogo', async () => {
    const source = sourceMocks();
    const cveAt = new Date('2026-01-02T00:00:00Z');
    const kevAt = new Date('2025-12-31T00:00:00Z');
    const first = nvdCandidate('CVE-2026-9999');
    const second = nvdCandidate('CVE-2026-9998');
    source.searchCve.mockResolvedValue({
      value: [first, second],
      obtainedAt: cveAt,
    });
    source.loadKev.mockResolvedValue({
      value: { contains: (cve: string) => cve === first.cve },
      obtainedAt: kevAt,
    });
    const result = await new EvaluateWithSources(basic, source, config).execute(
      input,
      signal(),
    );
    expect(source.searchCve).toHaveBeenCalledWith(
      cpe,
      expect.any(AbortSignal),
      expect.any(Number),
    );
    expect(source.loadKev).toHaveBeenCalledTimes(1);
    expect(result.sources).toEqual({
      nvd: 'AVAILABLE',
      kev: 'AVAILABLE',
      checkedAt: kevAt.toISOString(),
    });
    expect(result.possibleCveMatches).toMatchObject([
      { cve: first.cve, inKev: true, nvdCheckedAt: cveAt },
      { cve: second.cve, inKev: false, nvdCheckedAt: cveAt },
    ]);
    expect(
      result.findings.flatMap((item) => (item.cve === null ? [] : [item.cve])),
    ).toEqual([first.cve, second.cve]);
  });

  it('omite CVE con rangos sin comparador o requisitos que no constan en el inventario', async () => {
    const source = sourceMocks();
    const range = {
      ...criterion,
      criteria: cpe.replace(':1:', ':*:'),
      versionEndIncluding: '2',
    };
    const prerequisite = {
      ...criterion,
      vulnerable: false,
      criteria: cpe.replace(':device:', ':other:'),
    };
    source.searchCve.mockResolvedValue({
      obtainedAt: at,
      value: [
        {
          ...nvdCandidate('CVE-2026-9999'),
          hasUnparsedAffectedData: true,
          configurations: [{ nodes: [{ operator: 'OR', cpeMatch: [range] }] }],
        },
        {
          ...nvdCandidate('CVE-2026-9998'),
          hasUnparsedAffectedData: true,
          configurations: [
            {
              operator: 'AND',
              nodes: [
                { operator: 'OR', cpeMatch: [criterion] },
                { operator: 'OR', negate: true, cpeMatch: [prerequisite] },
              ],
            },
          ],
        },
      ],
    });
    const result = await new EvaluateWithSources(basic, source, config).execute(
      input,
      signal(),
    );
    expect(result.sources).toEqual({
      nvd: 'AVAILABLE',
      kev: 'NOT_QUERIED',
      checkedAt: at.toISOString(),
    });
    expect(result.possibleCveMatches).toEqual([]);
    expect(source.loadKev).not.toHaveBeenCalled();
  });

  it('conserva la evaluación básica si la búsqueda CVE falla', async () => {
    const source = sourceMocks();
    source.searchCve.mockRejectedValue(new ExternalSourceError('UNAVAILABLE'));
    const result = await new EvaluateWithSources(basic, source, config).execute(
      input,
      signal(),
    );
    expect(result.sources).toEqual({
      nvd: 'UNAVAILABLE',
      kev: 'NOT_QUERIED',
      checkedAt: at.toISOString(),
    });
    expect(result.findings).toEqual(basic.execute(input).findings);
    expect(result.possibleCveMatches).toEqual([]);
    expect(source.loadKev).not.toHaveBeenCalled();
  });

  it('conserva CVE sustentadas si KEV falla y deja su pertenencia indeterminada', async () => {
    const source = sourceMocks();
    source.searchCve.mockResolvedValue({
      value: [nvdCandidate('CVE-2026-9999')],
      obtainedAt: at,
    });
    source.loadKev.mockRejectedValue(new ExternalSourceError('TIMEOUT'));
    const result = await new EvaluateWithSources(basic, source, config).execute(
      input,
      signal(),
    );
    expect(result.sources).toEqual({
      nvd: 'AVAILABLE',
      kev: 'UNAVAILABLE',
      checkedAt: at.toISOString(),
    });
    expect(result.possibleCveMatches).toMatchObject([
      { cve: 'CVE-2026-9999', inKev: null },
    ]);
  });
  it('correlaciona configuraciones CPE con affected adicional y consulta KEV', async () => {
    const source = sourceMocks();
    const cve = 'CVE-2026-1234';

    const parsed = parseNvdPage({
      resultsPerPage: 1,
      startIndex: 0,
      totalResults: 1,
      format: 'NVD_CVE',
      version: '2.0',
      timestamp: at.toISOString(),
      vulnerabilities: [
        {
          cve: {
            id: cve,
            published: at.toISOString(),
            lastModified: at.toISOString(),
            descriptions: [{ lang: 'en', value: 'Synthetic fixture' }],
            references: [],
            vulnStatus: 'Analyzed',
            affected: [
              {
                source: 'synthetic',
                affectedData: [
                  {
                    vendor: 'Example',
                    product: 'Device',
                    versions: [{ version: '1', status: 'affected' }],
                  },
                ],
              },
            ],
            configurations: [
              {
                nodes: [
                  {
                    operator: 'OR',
                    cpeMatch: [
                      {
                        vulnerable: true,
                        criteria: cpe,
                        matchCriteriaId: '00000000-0000-4000-8000-000000000001',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    });

    expect(parsed.candidates[0]?.hasUnparsedAffectedData).toBe(true);

    source.searchCve.mockResolvedValue({
      value: parsed.candidates,
      obtainedAt: at,
    });

    source.loadKev.mockResolvedValue({
      value: { contains: (id: string) => id === cve },
      obtainedAt: at,
    });

    const result = await new EvaluateWithSources(basic, source, config).execute(
      input,
      signal(),
    );

    expect(result.sources).toMatchObject({
      nvd: 'AVAILABLE',
      kev: 'AVAILABLE',
    });
    expect(source.loadKev).toHaveBeenCalledTimes(1);
    expect(result.possibleCveMatches).toMatchObject([{ cve, inKev: true }]);

    const finding = result.findings.find((item) => item.cve === cve);

    expect(finding).toMatchObject({
      category: 'POSSIBLE_CVE_MATCH',
      confidence: 'POSSIBLE',
      ruleId: 'NVD_POSSIBLE_MATCH',
    });
    expect(finding?.limitation).toContain(
      'no se interpretaron los datos adicionales de affected',
    );
  });
});
