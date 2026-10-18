import { isPortugueseWord } from "./lexicon/index.ts";
import type { ScriptDoc } from "./script.ts";
import type { Word } from "./types.ts";

/**
 * Names of the course written the way the course writes them ("Zapi" → "Zappy", "de binha" →
 * "Debinha"). Applied when a transcript is read, never stored: changing the glossary corrects
 * every lesson again without transcribing anything. A real Portuguese word (shared/lexicon) is
 * never swapped for a name, and only a word whisper was unsure about changes letters.
 */

/** A heard form that is not the term letter for letter only changes below this confidence. */
const UNSURE = 0.8;

/** Terms a course glossary keeps. */
export const GLOSSARY_LIMIT = 60;

/** A glossary as it is saved: trimmed, without empty or repeated terms (in its order). */
export function normalizeGlossary(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const term = raw.trim().replace(/\s+/g, " ");
    const k = foldText(term);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(term);
  }
  return out;
}

/** Lowercase, no accents, letters and digits only. */
export const foldText = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]/g, "");

/**
 * Roughly how a name sounds in Portuguese: doubled letters, y/i, k/c, ph/f and a silent leading
 * h collapse ("Zappy" and "Zapi" sound the same).
 */
export const soundKey = (s: string): string =>
  foldText(s)
    .replace(/ph/g, "f")
    .replace(/y/g, "i")
    .replace(/k/g, "c")
    .replace(/^h/, "")
    .replace(/(.)\1+/g, "$1");

interface Term {
  /** As the course writes it. */
  text: string;
  /** Folded, without spaces. */
  plain: string;
  key: string;
  words: number;
  /** Most edits a heard form may be away from the term. */
  maxDist: number;
}

/** Up to 5 letters a term tolerates one edit, longer ones two; very short ones must match. */
const allowedDistance = (letters: number): number => (letters <= 3 ? 0 : letters <= 5 ? 1 : 2);

function compile(terms: string[]): Term[] {
  const seen = new Set<string>();
  const out: Term[] = [];
  for (const raw of terms) {
    const text = raw.trim().replace(/\s+/g, " ");
    const plain = foldText(text);
    if (plain.length < 3 || seen.has(plain)) continue;
    seen.add(plain);
    out.push({
      text,
      plain,
      key: soundKey(text),
      words: text.split(" ").length,
      maxDist: allowedDistance(plain.length),
    });
  }
  return out;
}

/** Optimal string alignment distance, or `max + 1` as soon as it is clearly larger. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d = Math.min(d, prev2[j - 2] + 1);
      cur.push(d);
      best = Math.min(best, d);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

const LEADING = /^[^\p{L}\p{N}]*/u;
const TRAILING = /[^\p{L}\p{N}]*$/u;

/** `core` with the punctuation around the words it replaces kept ("Zapi," → "Zappy,"). */
export function replaceCore(first: string, core: string, last = first): string {
  return `${LEADING.exec(first)?.[0] ?? ""}${core}${TRAILING.exec(last)?.[0] ?? ""}`;
}

export interface CorrectOptions {
  /** Positions the user corrected by hand: the glossary never touches them. */
  keep?: ReadonlySet<number>;
}

interface Match {
  at: number;
  n: number;
  term: Term;
  dist: number;
}

/**
 * Writes the glossary terms where whisper heard something close to them, comparing without
 * accents or case and by sound. A term can be several words ("Sistema Zero", "Chave do Farol") and
 * a heard form can be split or joined ("de binha" → "Debinha"). Real Portuguese words are never
 * replaced by look-alikes, and a change of letters needs whisper to have been unsure (p < 0.8).
 * Times and confidence are kept; a joined word spans its parts, averages their confidence and
 * lists their indexes (`joined`). Every changed word keeps what was heard (`heard`). Applying it
 * again changes nothing.
 */
export function correctWords<W extends Word>(
  words: W[],
  terms: string[],
  opts: CorrectOptions = {},
): W[] {
  const list = compile(terms);
  if (!list.length || !words.length) return words;
  const folded = words.map((w) => foldText(w.text));
  const sounds = words.map((w) => soundKey(w.text));
  const widest = Math.max(...list.map((t) => t.words)) + 1;
  // A lesson repeats its words: each heard form is compared with each term once.
  const known = list.map(() => new Map<string, number>());
  const matches: Match[] = [];
  for (let at = 0; at < words.length; at++) {
    if (!folded[at] || opts.keep?.has(at)) continue;
    const plains: string[] = [];
    const keys: string[] = [];
    for (let k = at; k < at + widest && k < words.length; k++) {
      if (!folded[k] || opts.keep?.has(k)) break;
      plains.push((plains[plains.length - 1] ?? "") + folded[k]);
      keys.push((keys[keys.length - 1] ?? "") + sounds[k]);
    }
    list.forEach((term, t) => {
      const hi = Math.min(term.words + 1, keys.length);
      for (let n = Math.max(1, term.words - 1); n <= hi; n++) {
        const key = keys[n - 1];
        if (key.length > term.key.length + term.maxDist) break;
        if (key.length < term.key.length - term.maxDist) continue;
        const plain = plains[n - 1];
        const exact = plain === term.plain;
        let dist = exact ? 0 : known[t].get(key);
        if (dist === undefined) {
          dist = distance(key, term.key, term.maxDist);
          known[t].set(key, dist);
        }
        if (dist > term.maxDist) continue;
        const real = folded.slice(at, at + n).every(isPortugueseWord);
        if (n === 1) {
          // A real word stays itself (not even its case changes), and a short heard form has to
          // sound exactly right.
          if (real || plain.length < 3 || (plain.length <= 3 && dist > 0)) continue;
        } else if (real && !exact) {
          // Several real words only when they spell the term ("sistema zero").
          continue;
        }
        if (!exact && words.slice(at, at + n).reduce((s, w) => s + w.p, 0) / n >= UNSURE) continue;
        matches.push({ at, n, term, dist });
      }
    });
  }
  if (!matches.length) return words;
  // Closest first, then the window with the term's own number of words, then the earliest.
  matches.sort(
    (a, b) =>
      a.dist - b.dist || Math.abs(a.n - a.term.words) - Math.abs(b.n - b.term.words) || a.at - b.at,
  );
  const taken = new Uint8Array(words.length);
  const chosen = new Map<number, Match>();
  for (const m of matches) {
    let free = true;
    for (let k = m.at; k < m.at + m.n && free; k++) free = !taken[k];
    if (!free) continue;
    for (let k = m.at; k < m.at + m.n; k++) taken[k] = 1;
    chosen.set(m.at, m);
  }
  const out: W[] = [];
  for (let i = 0; i < words.length; i++) {
    const m = chosen.get(i);
    if (!m) {
      out.push(words[i]);
      continue;
    }
    const first = words[i];
    const last = words[i + m.n - 1];
    const text = replaceCore(first.text, m.term.text, last.text);
    if (m.n === 1) out.push(text === first.text ? first : { ...first, text, heard: first.text });
    else {
      const parts = words.slice(i, i + m.n);
      out.push({
        ...first,
        text,
        end: last.end,
        p: Math.round((parts.reduce((s, w) => s + w.p, 0) / m.n) * 100) / 100,
        heard: parts.map((w) => w.text).join(" "),
        joined: parts.map((w, k) => w.i ?? i + k),
      });
    }
    i += m.n - 1;
  }
  return out;
}

/** Names worth correcting that the script already spells out. */
const MAX_SCRIPT_TERMS = 40;
const CONNECTORS = new Set(["do", "da", "de", "dos", "das"]);
const capitalized = (w: string): boolean => /^\p{Lu}/u.test(w);

/**
 * Names the script spells out: the speakers ("Debinha (avatar)" → "Debinha"), names of several
 * words (capitalized in the middle of a sentence, joined by do/da/de: "Sistema Zero", "Chave do
 * Farol") and single capitalized words that are not Portuguese words ("Zappy"; "Salvar" and
 * "Executar" are buttons, not names).
 */
export function scriptTerms(doc: ScriptDoc | null): string[] {
  if (!doc) return [];
  const count = new Map<string, number>();
  const add = (t: string, n = 1, speaker = false): void => {
    const name = t.replace(/[^\p{L}\p{N}\s-]/gu, "").trim();
    if (name.length < 3) return;
    if (!speaker && !name.includes(" ") && isPortugueseWord(foldText(name))) return;
    count.set(name, (count.get(name) ?? 0) + n);
  };
  for (const section of doc.sections)
    for (const item of section.items) {
      if (item.kind !== "speech") continue;
      add(item.speaker.replace(/\s*\(.*\)\s*$/, ""), 100, true);
      const tokens = item.text.split(/\s+/).filter(Boolean);
      let run: string[] = [];
      const flush = (): void => {
        while (run.length && CONNECTORS.has(run[run.length - 1].toLowerCase())) run.pop();
        if (run.length) add(run.join(" "));
        run = [];
      };
      tokens.forEach((raw, i) => {
        const w = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
        const sentenceStart = i === 0 || /[.!?:…]["”)]?$/.test(tokens[i - 1]);
        if (w && capitalized(w) && (!sentenceStart || run.length)) run.push(w);
        else if (run.length && CONNECTORS.has(w)) run.push(w);
        else flush();
        // Punctuation after a word ends the name.
        if (/[^\p{L}\p{N}]$/u.test(raw)) flush();
      });
      flush();
    }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SCRIPT_TERMS)
    .map(([t]) => t);
}

/**
 * The terms whisper's initial prompt should carry, most relevant first: those the script mentions
 * most, then the rest in the order the glossary lists them.
 */
export function promptTerms(terms: string[], scriptText = "", max = 20): string[] {
  const text = ` ${scriptText
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")} `;
  const seen = new Set<string>();
  const unique = terms
    .map((t) => t.trim())
    .filter((t) => {
      const k = foldText(t);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const mentions = (t: string): number => {
    const needle = ` ${t
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()} `;
    return needle.trim() ? text.split(needle).length - 1 : 0;
  };
  return unique
    .map((t, i) => ({ t, i, n: mentions(t) }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, max)
    .map((x) => x.t);
}
