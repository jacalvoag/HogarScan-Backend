import {
  createCpeDictionaryFilter,
  resolveDeclaredCpe,
} from './resolve-declared-cpe.js';

const identification = {
  vendor: 'Example',
  product: 'Device',
  version: '1.2.3a',
  source: 'USER_DEVICE_LABEL',
} as const;
const exact = {
  id: 'dictionary-id',
  name: 'cpe:2.3:h:example:device:1.2.3a:*:*:*:*:*:*:*',
  deprecated: false,
  titles: [],
  replacementIds: [],
};

describe('resolución CPE de una identificación declarada', () => {
  it('busca el triplete literal en todas las clases y usa el nombre recibido', () => {
    expect(createCpeDictionaryFilter(identification)).toBe(
      'cpe:2.3:*:Example:Device:1.2.3a',
    );
    expect(resolveDeclaredCpe(identification, [exact])).toBe(exact.name);
  });

  it.each(['Device Pro', 'device:*', 'device\n', '*'])(
    'evita inventar equivalencias o enviar sintaxis ambigua: %j',
    (product) => {
      expect(
        createCpeDictionaryFilter({ ...identification, product }),
      ).toBeUndefined();
    },
  );

  it.each([
    ['sin resultados', []],
    ['obsoleto', [{ ...exact, deprecated: true, replacementIds: ['new'] }]],
    [
      'varias clases',
      [
        exact,
        { ...exact, id: 'other', name: exact.name.replace(':h:', ':a:') },
      ],
    ],
    [
      'otra edición',
      [{ ...exact, name: 'cpe:2.3:h:example:device:1.2.3a:*:pro:*:*:*:*:*' }],
    ],
    [
      'otra versión',
      [{ ...exact, name: exact.name.replace('1.2.3a', '1.2.3A') }],
    ],
    [
      'versión genérica',
      [{ ...exact, name: exact.name.replace('1.2.3a', '*') }],
    ],
    [
      'fabricante diferente',
      [{ ...exact, name: exact.name.replace('example', 'other') }],
    ],
    [
      'sintaxis no soportada',
      [
        {
          ...exact,
          name: exact.name.replace('device', String.raw`my\:device`),
        },
      ],
    ],
  ])('deja inconcluso el caso %s', (_reason, candidates) => {
    expect(resolveDeclaredCpe(identification, candidates)).toBeUndefined();
  });
});
