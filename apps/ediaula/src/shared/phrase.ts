/**
 * Finding a phrase in a transcript: the words as compared (lower case, no accents, letters and
 * digits only) and where a run of them is said. Used to time a "Na tela" at the words it quotes
 * (screenCues.ts) and to find the kids table's lines (kidsEdition.ts).
 */

/** A word of a transcript. */
export interface SourceWord {
  text: string;
  start: number;
  end: number;
}

/** A word as compared: lower case, no accents, letters and digits only. */
export const fold = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

export const tokens = (s: string): string[] => s.split(/\s+/).map(fold).filter(Boolean);

/** Numbers the transcription writes in digits or in words alike ("zero" and "0"). */
const NUMBERS: Record<string, string> = {
  zero: "0",
  dois: "2",
  duas: "2",
  tres: "3",
  quatro: "4",
  cinco: "5",
  seis: "6",
  sete: "7",
  oito: "8",
  nove: "9",
  dez: "10",
  cem: "100",
};
const sameWord = (a: string, b: string): boolean =>
  a === b || (NUMBERS[a] ?? a) === (NUMBERS[b] ?? b);

/** Words of a loose match that may be heard otherwise ("num" heard "no"): one in four. */
const looseMisses = (n: number): number => (n >= 4 ? Math.floor(n / 4) : 0);

/** The words of the anchors looked at on each side. */
const ANCHOR_WORDS = 6;

export interface PhraseMatch {
  start: number;
  end: number;
  /** Anchor words that matched around it, out of those compared. */
  anchors: number;
}

export interface PhraseOptions {
  /** Last words said before it, and first words after it: the better they match, the likelier. */
  before?: string;
  after?: string;
  /** Among the places that match the anchors equally, which one (1 = the first). */
  occurrence?: number;
  /** Only where it starts inside [from, to]. */
  from?: number;
  to?: number;
  /**
   * Where no place says every word, accept one heard otherwise in four (never the last one, the
   * moment a direction acts on): a name or a short word the transcription got wrong.
   */
  loose?: boolean;
}

/**
 * Where `phrase` is said in `words`: every place its words are said in a row (inside [from, to]),
 * the one whose neighbours match the anchors best, and among equals the `occurrence`-th. Null
 * when it is not said there.
 */
export function findPhrase(
  words: readonly SourceWord[],
  phrase: string,
  opts: PhraseOptions = {},
): PhraseMatch | null {
  const said = words.map((w) => ({ ...w, key: fold(w.text) })).filter((w) => w.key);
  const wanted = tokens(phrase);
  if (!wanted.length) return null;
  const before = tokens(opts.before ?? "").slice(-ANCHOR_WORDS);
  const after = tokens(opts.after ?? "").slice(0, ANCHOR_WORDS);
  const lo = opts.from ?? Number.NEGATIVE_INFINITY;
  const hi = opts.to ?? Number.POSITIVE_INFINITY;
  const places = (misses: number): PhraseMatch[] => {
    const found: PhraseMatch[] = [];
    for (let i = 0; i + wanted.length <= said.length; i++) {
      if (said[i].start < lo || said[i].start > hi) continue;
      const last = i + wanted.length - 1;
      if (!sameWord(said[last].key, wanted[wanted.length - 1])) continue;
      let wrong = 0;
      for (let k = 0; k < wanted.length && wrong <= misses; k++)
        if (!sameWord(said[i + k].key, wanted[k])) wrong++;
      if (wrong > misses) continue;
      let anchors = 0;
      for (let k = 1; k <= before.length; k++)
        if (said[i - k]?.key === before[before.length - k]) anchors++;
      for (let k = 0; k < after.length; k++) if (said[last + 1 + k]?.key === after[k]) anchors++;
      found.push({ start: said[i].start, end: said[last].end, anchors });
    }
    return found;
  };
  let found = places(0);
  // The fewest words heard otherwise first: a place that says them all always wins.
  for (
    let misses = 1;
    !found.length && opts.loose && misses <= looseMisses(wanted.length);
    misses++
  )
    found = places(misses);
  if (!found.length) return null;
  const best = Math.max(...found.map((f) => f.anchors));
  const top = found.filter((f) => f.anchors === best);
  return top[Math.min(top.length, Math.max(1, opts.occurrence ?? 1)) - 1];
}

/** Stretches joined where they touch or overlap, in order. */
export function joinStretches(list: readonly (readonly [number, number])[]): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of [...list].sort((x, y) => x[0] - y[0])) {
    const last = out.at(-1);
    if (last && a <= last[1] + 0.05) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}
