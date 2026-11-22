export interface SessionTokenHasher {
  hash(token: string): string;
}
