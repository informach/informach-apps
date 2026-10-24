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
  const found: PhraseMatch[] = [];
  for (let i = 0; i + wanted.length <= said.length; i++) {
    if (said[i].start < lo || said[i].start > hi) continue;
    if (!wanted.every((key, k) => said[i + k].key === key)) continue;
    let anchors = 0;
    for (let k = 1; k <= before.length; k++)
      if (said[i - k]?.key === before[before.length - k]) anchors++;
    const last = i + wanted.length - 1;
    for (let k = 0; k < after.length; k++) if (said[last + 1 + k]?.key === after[k]) anchors++;
    found.push({ start: said[i].start, end: said[last].end, anchors });
  }
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
