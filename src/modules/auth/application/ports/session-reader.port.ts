export interface SessionRecord {
  readonly userId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export interface SessionReader {
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
}
