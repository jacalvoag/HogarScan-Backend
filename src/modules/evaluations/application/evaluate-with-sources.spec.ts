import { EvaluateBasic } from './evaluate-basic.js';
import { EvaluateWithSources } from './evaluate-with-sources.js';
import { ExternalSourceError } from './ports/external-source-result.js';
import type { EvaluationInput } from '../domain/evaluation-input.js';

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

describe('evaluación con fuentes externas', () => {
  const at = new Date('2026-01-01T00:00:00.000Z');
  const basic = new EvaluateBasic(() => at);
  it('no consulta con fuentes desactivadas ni sin identificación', async () => {
    const source = { searchCpe: vi.fn() };
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
    expect(source.searchCpe).not.toHaveBeenCalled();
  });

  it('conserva la fecha original y no infiere CVE desde candidatos', async () => {
    const searchCpe = vi
      .fn()
      .mockResolvedValue({ value: [{ id: 'candidate' }], obtainedAt: at });
    const service = new EvaluateWithSources(
      basic,
      { searchCpe },
      { enabled: true, evaluationBudgetMs: 1000 },
    );
    const result = await service.execute(input, signal());
    expect(result.sources).toEqual({
      nvd: 'AVAILABLE',
      kev: 'NOT_QUERIED',
      checkedAt: at.toISOString(),
    });
    expect(result.possibleCveMatches).toEqual([]);
    expect(result.findings).toEqual(basic.execute(input).findings);
  });

  it('distingue un fallo externo de una búsqueda sin resultados', async () => {
    const searchCpe = vi
      .fn()
      .mockRejectedValue(new ExternalSourceError('UNAVAILABLE'));
    const service = new EvaluateWithSources(
      basic,
      { searchCpe },
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
    const searchCpe = vi.fn().mockRejectedValue(error);
    const service = new EvaluateWithSources(
      basic,
      { searchCpe },
      { enabled: true, evaluationBudgetMs: 1000 },
    );
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
          new Promise((_resolve, reject) =>
            externalSignal.addEventListener(
              'abort',
              () => reject(externalSignal.reason),
              { once: true },
            ),
          ),
      );
      const service = new EvaluateWithSources(
        basic,
        { searchCpe },
        { enabled: true, evaluationBudgetMs: 1000 },
      );
      const result = service.execute(input, signal());
      await vi.advanceTimersByTimeAsync(1000);
      expect((await result).sources.nvd).toBe('UNAVAILABLE');
    } finally {
      vi.useRealTimers();
    }
  });
});
