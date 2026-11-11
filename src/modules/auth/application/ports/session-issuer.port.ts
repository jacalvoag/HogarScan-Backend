export const SESSION_ISSUER = Symbol('SESSION_ISSUER');

export interface IssuedSession {
  readonly accessToken: string;
  readonly expiresAt: Date;
}

export interface SessionIssuer {
  issue(userId: string): Promise<IssuedSession>;
}
