/** "1 clipe", "3 clipes", "0 clipes": a count with the word that agrees with it. */
export const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

/** The word alone, in agreement with `n` ("selecionado" or "selecionados"). */
export const agree = (n: number, one: string, many: string): string => (n === 1 ? one : many);
