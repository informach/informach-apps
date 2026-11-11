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

/**
 * The words of a transcript's word as compared. The transcription sometimes joins two words in
 * one before a quoted name (`em "próxima`): each is a word of its own, the time shared between
 * them by their length.
 */
function spoken(w: SourceWord): (SourceWord & { key: string })[] {
  const parts = w.text.split(/\s+/).filter((t) => fold(t));
  if (parts.length < 2) return [{ ...w, key: fold(w.text) }];
  const total = parts.reduce((n, t) => n + t.length, 0);
  let start = w.start;
  return parts.map((text) => {
    const end = start + ((w.end - w.start) * text.length) / total;
    const word = { text, start, end, key: fold(text) };
    start = end;
    return word;
  });
}

/** Words of a loose match that may differ ("num" heard "no", a word left out): one in four. */
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
   * Where no place says every word, accept one in four heard otherwise, left out or added by
   * the transcription ("como o gato" heard "como gato"), never the last one: the moment a
   * direction acts on.
   */
  loose?: boolean;
  /**
   * With `loose`, how many words may be heard otherwise instead of one in four: for a search
   * already held to the stretch where the phrase must be (the line of the script that says it).
   */
  misses?: number;
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
  const said = words.flatMap(spoken).filter((w) => w.key);
  const wanted = tokens(phrase);
  if (!wanted.length) return null;
  const before = tokens(opts.before ?? "").slice(-ANCHOR_WORDS);
  const after = tokens(opts.after ?? "").slice(0, ANCHOR_WORDS);
  const lo = opts.from ?? Number.NEGATIVE_INFINITY;
  const hi = opts.to ?? Number.POSITIVE_INFINITY;
  /**
   * The last word said of the place starting at said word `i`, when the quote is said there with
   * at most `misses` words heard otherwise, left out or added (the last word always said).
   */
  const endOf = (i: number, misses: number): number | null => {
    const n = wanted.length;
    if (!misses) {
      const last = i + n - 1;
      if (last >= said.length) return null;
      for (let k = 0; k < n; k++) if (!sameWord(said[i + k].key, wanted[k])) return null;
      return last;
    }
    // Edit distance of the quote's first k words against the m words said from i.
    const width = Math.min(said.length - i, n + misses);
    let prev = Array.from({ length: width + 1 }, (_, m) => m);
    let best: number | null = null;
    for (let k = 1; k <= n; k++) {
      const row = [k];
      for (let m = 1; m <= width; m++) {
        const same = sameWord(said[i + m - 1].key, wanted[k - 1]);
        row[m] = Math.min(prev[m - 1] + (same ? 0 : 1), prev[m] + 1, row[m - 1] + 1);
        if (k === n && same && prev[m - 1] <= misses && best === null) best = i + m - 1;
      }
      prev = row;
    }
    return best;
  };
  const places = (misses: number): PhraseMatch[] => {
    const found: PhraseMatch[] = [];
    for (let i = 0; i < said.length; i++) {
      if (said[i].start < lo || said[i].start > hi) continue;
      // A place starts on a word of the quote's beginning.
      if (misses && !sameWord(said[i].key, wanted[0]) && !sameWord(said[i].key, wanted[1] ?? ""))
        continue;
      const last = endOf(i, misses);
      if (last === null) continue;
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
    !found.length && opts.loose && misses <= (opts.misses ?? looseMisses(wanted.length));
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
