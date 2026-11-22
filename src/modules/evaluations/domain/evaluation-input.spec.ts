import { createEvaluationInput } from './evaluation-input.js';

describe('Evaluation input', () => {
  it('accepts observations without requiring product identification', () => {
    expect(
      createEvaluationInput({
        observations: [{ port: 80, outcome: 'ACCEPTED' }],
      }),
    ).toEqual({
      observations: [{ port: 80, outcome: 'ACCEPTED' }],
    });
  });

  it('preserves explicitly declared identification', () => {
    const identification = {
      vendor: 'Example',
      product: 'Router',
      version: '1.0',
      source: 'USER_ADMIN_PANEL',
    } as const;
    expect(
      createEvaluationInput({
        observations: [{ port: 443, outcome: 'TIMEOUT' }],
        identification,
      }),
    ).toEqual({
      observations: [{ port: 443, outcome: 'TIMEOUT' }],
      identification,
    });
  });

  it('applies collection and identification invariants', () => {
    expect(() => createEvaluationInput({ observations: [] })).toThrow(
      RangeError,
    );
    expect(() =>
      createEvaluationInput({
        observations: [{ port: 22, outcome: 'ERROR' }],
        identification: {
          vendor: ' ',
          product: 'Router',
          version: '1',
          source: 'USER_DEVICE_LABEL',
        },
      }),
    ).toThrow('Invalid product identification');
  });
});
