import type {
  CredentialsReader,
  UserCredentials,
} from './ports/credentials-reader.port.js';
import type { PasswordHasher } from './ports/password-hasher.port.js';
import type { SessionIssuer } from './ports/session-issuer.port.js';
import { InvalidCredentialsError, LoginUser } from './login-user.js';

describe('LoginUser', () => {
  const credentials: UserCredentials = {
    user: {
      id: '6ba63463-9073-43d1-9b60-2fd868798cc0',
      email: 'persona@example.com',
      createdAt: new Date('2030-01-01T00:00:00.000Z'),
    },
    passwordHash: '$argon2id$stored-test-hash',
    summaryGeneration: 7,
  };

  const issued = {
    accessToken: 'A'.repeat(43),
    expiresAt: new Date('2030-01-08T00:00:00.000Z'),
  };

  const dummyHash = '$argon2id$dummy-test-hash';
  const findByEmail = vi.fn<CredentialsReader['findByEmail']>();
  const verify = vi.fn<PasswordHasher['verify']>();
  const issue = vi.fn<SessionIssuer['issue']>();
  let login: LoginUser;

  beforeEach(() => {
    vi.resetAllMocks();
    findByEmail.mockResolvedValue(credentials);
    verify.mockResolvedValue(true);
    issue.mockResolvedValue(issued);

    login = new LoginUser(
      { findByEmail },
      { hash: vi.fn(), verify },
      { issue },
      dummyHash,
    );
  });

  it('checks the exact password before issuing a session', async () => {
    const password = '  Una frase con Café 🔐  ';

    await expect(
      login.execute('Persona@Example.com', password),
    ).resolves.toEqual({
      user: credentials.user,
      ...issued,
      summaryGeneration: 7,
    });

    expect(findByEmail).toHaveBeenCalledExactlyOnceWith('persona@example.com');
    expect(verify).toHaveBeenCalledExactlyOnceWith(
      password,
      credentials.passwordHash,
    );
    expect(issue).toHaveBeenCalledExactlyOnceWith(credentials.user.id);
  });

  it('rejects a wrong password without issuing a session', async () => {
    verify.mockResolvedValueOnce(false);

    await expect(
      login.execute(credentials.user.email, 'wrong'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(issue).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'checks the dummy hash for a missing account even if verification returns %s',
    async (valid) => {
      findByEmail.mockResolvedValueOnce(null);
      verify.mockResolvedValueOnce(valid);

      await expect(
        login.execute('missing@example.com', 'password'),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);

      expect(verify).toHaveBeenCalledExactlyOnceWith('password', dummyHash);
      expect(issue).not.toHaveBeenCalled();
    },
  );

  it('propagates a credential lookup failure', async () => {
    const error = new Error('Lookup unavailable');
    findByEmail.mockRejectedValueOnce(error);

    await expect(
      login.execute(credentials.user.email, 'password'),
    ).rejects.toBe(error);

    expect(verify).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
  });

  it('propagates password verification failures', async () => {
    const error = new Error('Stored hash invalid');
    verify.mockRejectedValueOnce(error);

    await expect(
      login.execute(credentials.user.email, 'password'),
    ).rejects.toBe(error);

    expect(issue).not.toHaveBeenCalled();
  });

  it('propagates a session persistence failure', async () => {
    const error = new Error('Session storage unavailable');
    issue.mockRejectedValueOnce(error);

    await expect(
      login.execute(credentials.user.email, 'password'),
    ).rejects.toBe(error);
  });
});
