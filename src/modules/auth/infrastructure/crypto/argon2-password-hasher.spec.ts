import { Argon2PasswordHasher } from './argon2-password-hasher.js';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('creates Argon2id hashes with random salts and the chosen work factors', async () => {
    const password = 'Una frase larga de prueba';

    const [first, second] = await Promise.all([
      hasher.hash(password),
      hasher.hash(password),
    ]);

    expect(first).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(second).not.toBe(first);

    await expect(hasher.verify(password, first)).resolves.toBe(true);
    await expect(hasher.verify(password, second)).resolves.toBe(true);
  });

  it('compares the exact password, preserving spaces and Unicode', async () => {
    const password = '  Una frase con Café 🔐  ';
    const encodedHash = await hasher.hash(password);

    await expect(hasher.verify(password, encodedHash)).resolves.toBe(true);

    await expect(hasher.verify(password.trim(), encodedHash)).resolves.toBe(
      false,
    );

    await expect(
      hasher.verify(password.normalize('NFD'), encodedHash),
    ).resolves.toBe(false);

    await expect(
      hasher.verify('Contraseña incorrecta', encodedHash),
    ).resolves.toBe(false);
  });

  it('preserves the final character of a 128-character password', async () => {
    const prefix = 'a'.repeat(127);
    const encodedHash = await hasher.hash(`${prefix}X`);

    await expect(hasher.verify(`${prefix}X`, encodedHash)).resolves.toBe(true);
    await expect(hasher.verify(`${prefix}Y`, encodedHash)).resolves.toBe(false);
  });

  it('propagates a malformed stored hash as an error', async () => {
    await expect(
      hasher.verify('Una frase larga de prueba', 'invalid-stored-hash'),
    ).rejects.toThrow();
  });
});
