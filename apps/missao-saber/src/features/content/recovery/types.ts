// Each pair applies the same strategy to two independently authored situations.
// Reusing the family across encounters prevents artificial strategy diversity.
export type RecoveryQuestion =
  | [prompt: string, answer: number, explanation: string]
  | [prompt: string, answer: string, explanation: string, wrong: [string, string]];
export type RecoveryStrategy = [
  family: string,
  hint: string | [first: string, later: string],
  method: string | [first: string, later: string],
  first: RecoveryQuestion,
  later: RecoveryQuestion,
];
export type RecoveryBank = Record<string, [RecoveryStrategy, RecoveryStrategy, RecoveryStrategy]>;
