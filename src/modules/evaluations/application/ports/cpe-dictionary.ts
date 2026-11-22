/** A dictionary result is a candidate, not proof of a user's product identity. */
export interface CpeDictionaryCandidate {
  readonly id: string;
  readonly name: string;
  readonly deprecated: boolean;
  readonly titles: readonly {
    readonly language: string;
    readonly text: string;
  }[];
  readonly replacementIds: readonly string[];
}

export interface CpeDictionaryPage {
  readonly startIndex: number;
  readonly resultsPerPage: number;
  readonly totalResults: number;
  readonly candidates: readonly CpeDictionaryCandidate[];
}
