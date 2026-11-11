import { createTcpObservations, PILOT_PORTS } from './tcp-observations.js';
import type { TcpObservation } from './tcp-observations.js';
import { expectTypeOf } from 'vitest';

describe('TCP observations', () => {
  it('only allows compatible protocol evidence on accepted observations', () => {
    expectTypeOf<{
      port: 80;
      outcome: 'ACCEPTED';
      protocol: 'HTTP';
      evidenceKind: 'HTTP_RESPONSE';
    }>().toExtend<TcpObservation>();
    expectTypeOf<{
      port: 80;
      outcome: 'ACCEPTED';
      protocol: 'HTTP';
    }>().not.toExtend<TcpObservation>();
    expectTypeOf<{
      port: 80;
      outcome: 'ACCEPTED';
      protocol: 'HTTP';
      evidenceKind: 'SSH_IDENTIFICATION';
    }>().not.toExtend<TcpObservation>();
    expectTypeOf<{
      port: 80;
      outcome: 'TIMEOUT';
      protocol: 'HTTP';
      evidenceKind: 'HTTP_RESPONSE';
    }>().not.toExtend<TcpObservation>();
    expectTypeOf<{
      port: 21;
      outcome: 'ACCEPTED';
    }>().not.toExtend<TcpObservation>();
  });

  it('accepts all pilot ports with distinct outcomes and explicit evidence', () => {
    const observations: TcpObservation[] = [
      {
        port: 22,
        outcome: 'ACCEPTED',
        protocol: 'SSH',
        evidenceKind: 'SSH_IDENTIFICATION',
      },
      { port: 23, outcome: 'REFUSED' },
      { port: 80, outcome: 'TIMEOUT' },
      { port: 443, outcome: 'ERROR' },
      { port: 445, outcome: 'ACCEPTED' },
      { port: 3389, outcome: 'REFUSED' },
    ];

    expect(observations.map(({ port }) => port)).toEqual([...PILOT_PORTS]);
    expect(createTcpObservations(observations)).toEqual(observations);
  });

  it('accepts a single observation without inferring a protocol from its port', () => {
    expect(createTcpObservations([{ port: 80, outcome: 'ACCEPTED' }])).toEqual([
      { port: 80, outcome: 'ACCEPTED' },
    ]);
  });

  it('rejects empty and oversized collections', () => {
    expect(() => createTcpObservations([])).toThrow(RangeError);
    const observation: TcpObservation = { port: 22, outcome: 'TIMEOUT' };
    expect(() => createTcpObservations(Array(7).fill(observation))).toThrow(
      RangeError,
    );
  });

  it('rejects repeated ports even when their outcomes differ', () => {
    expect(() =>
      createTcpObservations([
        { port: 22, outcome: 'ACCEPTED' },
        { port: 22, outcome: 'REFUSED' },
      ]),
    ).toThrow('An evaluation cannot repeat a port');
  });

  it('copies observations so changes to the input do not change the result', () => {
    const input: TcpObservation[] = [{ port: 22, outcome: 'TIMEOUT' }];
    const result = createTcpObservations(input);
    input[0] = { port: 23, outcome: 'ERROR' };
    expect(result).toEqual([{ port: 22, outcome: 'TIMEOUT' }]);
  });
});
