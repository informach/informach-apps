import { strip, type TimelineWord } from "./cleanup.ts";
import { type GlossaryTerm, termAliases, termText } from "./glossary.ts";
import { compoundsOf, fuzzyEqual, phoneticKey, type SpeechToken, tokenize } from "./ptSpeech.ts";
import type { ScriptDoc, ScriptSection } from "./script.ts";

/**
 * Lines up a script section with what was actually said on the timeline: a longest common
 * subsequence of spoken Portuguese tokens (ptSpeech.ts), where a word said exactly as written
 * scores 2 and one said another way (by sound, or a name the glossary knows) scores 1. When a
 * passage was recorded more than once, the LAST take is the one matched, which is how retakes
 * are usually done. Each line lies where most of its words were said in a row; what was said
 * outside the script comes back as whole blocks to review: false starts and earlier takes of a
 * line, asides, comments. A few words slipped into a line (a paraphrase) are not among them.
 */

export interface LineMatch {
  /** Index into section.items. */
  item: number;
  /** Script tokens of the line found in its take. */
  matched: number;
  total: number;
  /** Timeline span of the matched words. */
  start?: number;
  end?: number;
}

export interface OffScript {
  start: number;
  end: number;
  text: string;
  words: number;
  /** Keys of the words (TimelineWord.key). */
  keys: string[];
  /** Index into Alignment.lines of the script line this run is another take of. */
  retakeOf?: number;
}

export interface Alignment {
  lines: LineMatch[];
  offScript: OffScript[];
  /** Fraction of the script's tokens found in the recording. */
  coverage: number;
  /** The same, leaving articles and prepositions out (rankSections compares sections by it). */
  content: number;
  /** Words spoken on the timeline (with letters or digits). */
  spoken: number;
}

export interface AlignOptions {
  /**
   * The course glossary and the script's names: short terms may match by sound, and a single
   * word an alias names ("Zapi" for "Zappy") is the term itself. The words come already
   * corrected by the glossary (glossary.ts); this covers what the correction left.
   */
  glossary?: readonly GlossaryTerm[];
}

/** Off-script runs shorter than this many words are left to the filler cleanup. */
const MIN_RUN = 3;
/** Up to this many words said inside a matched line are a paraphrase, never a cut. */
export const PARAPHRASE_WORDS = 3;
/** A whole block of speech starts and ends at a pause at least this long, or at punctuation. */
export const BLOCK_PAUSE = 0.3;
/** A long pause splits two unrelated off-script passages. */
const SPLIT_PAUSE = 1.5;
/** Another cluster of a line belongs to its take with this many tokens, or two close by. */
const CLUSTER_MIN = 3;
const CLUSTER_NEAR = 8;
/** A run is another take of a line when this share of its tokens are the line's, in order. */
const RETAKE_SHARE = 0.6;
/** Longest run (in tokens) compared against the lines for a retake. */
const RETAKE_TOKENS = 80;

/** Below these the section chosen automatically is confirmed by the person (ScriptPanel). */
export const CONFIRM_COVERAGE = 0.6;
export const CONFIRM_MARGIN = 0.1;
/** proposeOffScript refuses when more than this share of what was said is off the script. */
export const OFF_SCRIPT_LIMIT = 0.35;

const hasText = (w: TimelineWord): boolean => strip(w.text).length > 0;
const punctuated = (text: string): boolean => /[,.;:!?…]["”')\]]*$/.test(text.trim());

interface Glossary {
  /** Tokens of glossary terms: compared by sound even when short. */
  terms: Set<string>;
  /** Single-word aliases, as the term's token. */
  alias: Map<string, string>;
}

function glossaryIndex(list: readonly GlossaryTerm[] | undefined): Glossary {
  const terms = new Set<string>();
  const alias = new Map<string, string>();
  for (const t of list ?? []) {
    const term = tokenize(termText(t)).map((x) => x.tok);
    for (const tok of term) terms.add(tok);
    if (term.length !== 1) continue;
    for (const a of termAliases(t)) {
      const heard = tokenize(a).map((x) => x.tok);
      if (heard.length === 1) alias.set(heard[0], term[0]);
    }
  }
  return { terms, alias };
}

/** A key with up to two letters left out, every way (symmetric-delete lookup). */
function deletions(key: string): string[] {
  const out = new Set([key]);
  for (let a = 0; a < key.length; a++) {
    const one = key.slice(0, a) + key.slice(a + 1);
    out.add(one);
    for (let b = a; b < one.length; b++) out.add(one.slice(0, b) + one.slice(b + 1));
  }
  return [...out];
}

/**
 * Scores of every spoken token against every script token: 2 exact, 1 approximate, 0 none. Two
 * sound keys at most two edits apart share a key with two letters left out, so each spoken word
 * is only compared with the few script words that share one with it.
 */
interface Scores {
  /** For each spoken token, its scores against the distinct script tokens. */
  rows: Uint8Array[];
  /** For each script token, its index among the distinct ones. */
  cols: Int32Array;
}

function scorer(spoken: readonly string[], script: readonly string[], g: Glossary): Scores {
  const scriptIds = new Map<string, number>();
  const cols = Int32Array.from(script, (t) => {
    let id = scriptIds.get(t);
    if (id === undefined) {
      id = scriptIds.size;
      scriptIds.set(t, id);
    }
    return id;
  });
  const uniqueScript = [...scriptIds.keys()];
  const near = new Map<string, number[]>();
  uniqueScript.forEach((s, id) => {
    if (/\d|%/.test(s)) return;
    for (const d of deletions(phoneticKey(s))) {
      const list = near.get(d);
      if (list) list.push(id);
      else near.set(d, [id]);
    }
  });
  const known = new Map<string, Uint8Array>();
  const rows = spoken.map((raw) => {
    let row = known.get(raw);
    if (!row) {
      const tok = g.alias.get(raw) ?? raw;
      row = new Uint8Array(uniqueScript.length);
      if (!/\d|%/.test(tok))
        for (const d of deletions(phoneticKey(tok)))
          for (const candidate of near.get(d) ?? [])
            if (!row[candidate] && fuzzyEqual(tok, uniqueScript[candidate], g.terms))
              row[candidate] = 1;
      const exact = scriptIds.get(tok);
      if (exact !== undefined) row[exact] = 2;
      known.set(raw, row);
    }
    return row;
  });
  return { rows, cols };
}

/**
 * A match right after another one (the next word said, the next word written) scores this much
 * more: a take said in one go beats the same words picked one by one across other lines.
 */
const RUN_BONUS = 2;

/**
 * Weighted LCS, walking back from the end so the latest occurrence is matched first. `ends`
 * holds the best score of an alignment ending with a match at (i, j), `best` the best score of
 * any alignment of the prefixes; a match continuing a run adds RUN_BONUS.
 */
function lcs({ rows, cols }: Scores): [number, number][] {
  const n = rows.length;
  const m = cols.length;
  if (!n || !m) return [];
  const w = m + 1;
  const size = (n + 1) * w;
  const wide = (2 + RUN_BONUS) * Math.min(n, m) >= 65535;
  const ends = wide ? new Uint32Array(size) : new Uint16Array(size);
  const best = wide ? new Uint32Array(size) : new Uint16Array(size);
  for (let i = 1; i <= n; i++) {
    const row = rows[i - 1];
    for (let j = 1; j <= m; j++) {
      const at = i * w + j;
      const diag = at - w - 1;
      const s = row[cols[j - 1]];
      if (s) {
        const run = ends[diag] ? ends[diag] + RUN_BONUS : 0;
        ends[at] = s + Math.max(best[diag], run);
      }
      const up = best[at - w];
      const left = best[at - 1];
      const own = ends[at];
      best[at] = up > left ? (up > own ? up : own) : left > own ? left : own;
    }
  }
  const pairs: [number, number][] = [];
  let i = n;
  let j = m;
  let inRun = false;
  while (i > 0 && j > 0) {
    const at = i * w + j;
    const diag = at - w - 1;
    if (inRun || (ends[at] && best[at] === ends[at])) {
      pairs.push([i - 1, j - 1]);
      // When the run and a fresh start score the same, the run goes on: the take stays whole.
      inRun = !!ends[diag] && ends[at] === rows[i - 1][cols[j - 1]] + ends[diag] + RUN_BONUS;
      i--;
      j--;
    } else if (best[at - w] >= best[at - 1]) i--;
    else j--;
  }
  return pairs.reverse();
}

interface Prepared {
  words: TimelineWord[];
  tokens: SpeechToken[];
  compounds: Map<string, string[]>;
  glossary: Glossary;
}

function prepare(
  sections: readonly ScriptSection[],
  words: TimelineWord[],
  opts: AlignOptions,
): Prepared {
  const texts = sections.flatMap((s) =>
    s.items.flatMap((it) => (it.kind === "speech" ? [it.text] : [])),
  );
  const compounds = compoundsOf([...texts, ...words.map((w) => w.text)]);
  return {
    words,
    tokens: tokenize(
      words.map((w) => w.text),
      { compounds },
    ),
    compounds,
    glossary: glossaryIndex(opts.glossary),
  };
}

/** How many of `run` tokens appear in `line`, in order (exact or approximate). */
function inOrder(run: readonly string[], line: readonly string[], g: Glossary): number {
  return lcs(scorer(run, line, g)).length;
}

type Pair = [number, number];

/**
 * What was said outside the script: runs of words not in it (`inScript` 0), split at long pauses,
 * kept as whole blocks only, each named after the line it is another take of, if any.
 */
function offScriptRuns(
  words: TimelineWord[],
  inScript: Uint8Array,
  lineTokens: string[][],
  compounds: Map<string, string[]>,
  glossary: Glossary,
): OffScript[] {
  /** Whether the speech breaks between word k and its neighbor on `side` (or there is none). */
  const breaks = (k: number, side: -1 | 1): boolean => {
    const other = k + side;
    if (other < 0 || other >= words.length) return true;
    const [a, b] = side < 0 ? [words[other], words[k]] : [words[k], words[other]];
    return punctuated(a.text) || b.start - a.end >= BLOCK_PAUSE;
  };
  const offScript: OffScript[] = [];
  const flush = (from: number, to: number): void => {
    // Only whole blocks: a run that starts or ends inside a sentence leaves that part out.
    let a = from;
    if (!breaks(from, -1)) {
      while (a <= to && !breaks(a, 1)) a++;
      a++;
    }
    let b = to;
    if (!breaks(to, 1)) {
      while (b >= a && !breaks(b, -1)) b--;
      b--;
    }
    if (b < a) return;
    const run = words.slice(a, b + 1);
    const real = run.filter(hasText);
    if (real.length < MIN_RUN) return;
    const item: OffScript = {
      start: run[0].start,
      end: run[run.length - 1].end,
      text: run.map((w) => w.text).join(" "),
      words: real.length,
      keys: run.map((w) => w.key),
    };
    const toks = tokenize(
      run.map((w) => w.text),
      { compounds },
    ).map((t) => t.tok);
    if (toks.length && toks.length <= RETAKE_TOKENS) {
      let best = -1;
      let share = RETAKE_SHARE - 1e-9;
      lineTokens.forEach((lt, li) => {
        const s = inOrder(toks, lt, glossary) / toks.length;
        if (s > share) {
          share = s;
          best = li;
        }
      });
      if (best >= 0) item.retakeOf = best;
    }
    offScript.push(item);
  };
  let runStart = -1;
  for (let k = 0; k <= words.length; k++) {
    const free = k < words.length && !inScript[k];
    const split = free && runStart >= 0 && words[k].start - words[k - 1].end > SPLIT_PAUSE;
    if (runStart >= 0 && (!free || split)) {
      flush(runStart, k - 1);
      runStart = -1;
    }
    if (free && runStart < 0) runStart = k;
  }

  return offScript;
}

/** `scoreOnly` leaves the off-script runs out (rankSections only compares the coverage). */
function align(section: ScriptSection, pre: Prepared, scoreOnly = false): Alignment {
  const { words, tokens, compounds, glossary } = pre;
  const script: SpeechToken[] = [];
  const owner: number[] = [];
  const lines: LineMatch[] = [];
  const lineTokens: string[][] = [];
  section.items.forEach((it, idx) => {
    if (it.kind !== "speech") return;
    const t = tokenize(it.text, { compounds });
    lines.push({ item: idx, matched: 0, total: t.length });
    lineTokens.push(t.map((x) => x.tok));
    for (const tok of t) {
      script.push(tok);
      owner.push(lines.length - 1);
    }
  });
  const pairs = lcs(
    scorer(
      tokens.map((t) => t.tok),
      script.map((t) => t.tok),
      glossary,
    ),
  );
  const firstWord = (c: Pair[]): number => tokens[c[0][0]].src[0];
  const lastWord = (c: Pair[]): number => {
    const src = tokens[c[c.length - 1][0]].src;
    return src[src.length - 1];
  };

  // Each line's matches in spoken order, grouped where at most PARAPHRASE_WORDS words fall
  // between two of them; the largest group is the take, and sizable groups next to it join it.
  const byLine: Pair[][] = lines.map(() => []);
  for (const pair of pairs) byLine[owner[pair[1]]].push(pair);
  const used = new Uint8Array(words.length);
  const spans: Pair[] = [];
  let matchedAll = 0;
  let contentMatched = 0;
  byLine.forEach((list, li) => {
    if (!list.length) return;
    const clusters: Pair[][] = [];
    for (const pair of list) {
      const cur = clusters[clusters.length - 1];
      if (cur && tokens[pair[0]].src[0] - lastWord(cur) - 1 <= PARAPHRASE_WORDS) cur.push(pair);
      else clusters.push([pair]);
    }
    let main = 0;
    clusters.forEach((c, k) => {
      if (c.length >= clusters[main].length) main = k;
    });
    const joins = (c: Pair[], gap: number): boolean =>
      c.length >= CLUSTER_MIN || (c.length >= 2 && gap <= CLUSTER_NEAR);
    let lo = main;
    while (
      lo > 0 &&
      joins(clusters[lo - 1], firstWord(clusters[lo]) - lastWord(clusters[lo - 1]) - 1)
    )
      lo--;
    let hi = main;
    while (
      hi < clusters.length - 1 &&
      joins(clusters[hi + 1], firstWord(clusters[hi + 1]) - lastWord(clusters[hi]) - 1)
    )
      hi++;
    const kept = clusters.slice(lo, hi + 1).flat();
    const line = lines[li];
    let end = Number.NEGATIVE_INFINITY;
    for (const [ti, si] of kept) {
      for (const wi of tokens[ti].src) {
        used[wi] = 1;
        end = Math.max(end, words[wi].end);
      }
      line.matched++;
      if (!script[si].stop) contentMatched++;
    }
    matchedAll += line.matched;
    line.start = words[firstWord(clusters[lo])].start;
    line.end = end;
    spans.push([firstWord(clusters[lo]), lastWord(clusters[hi])]);
  });

  // A few words slipped into a matched line are a paraphrase: they stay.
  const inScript = Uint8Array.from(used);
  for (const [from, to] of spans) {
    let k = from;
    while (k <= to) {
      if (inScript[k]) {
        k++;
        continue;
      }
      let e = k;
      while (e + 1 <= to && !inScript[e + 1]) e++;
      if (e - k + 1 <= PARAPHRASE_WORDS) inScript.fill(2, k, e + 1);
      k = e + 1;
    }
  }

  const offScript = scoreOnly
    ? []
    : offScriptRuns(words, inScript, lineTokens, compounds, glossary);

  const content = script.filter((t) => !t.stop).length;
  return {
    lines,
    offScript,
    coverage: script.length ? matchedAll / script.length : 0,
    content: content ? contentMatched / content : 0,
    spoken: words.filter(hasText).length,
  };
}

export function alignSection(
  section: ScriptSection,
  words: TimelineWord[],
  opts: AlignOptions = {},
): Alignment {
  return align(section, prepare([section], words, opts));
}

export interface SectionRank {
  /** The section that matches best, -1 without words. */
  index: number;
  /** Its coverage, leaving articles and prepositions out. */
  coverage: number;
  /** How far ahead of the second best it is. */
  margin: number;
  /** The coverage of every section, in order. */
  scores: number[];
}

/** Every section scored against the recording, by share of its words spoken (Alignment.content). */
export function rankSections(
  doc: ScriptDoc,
  words: TimelineWord[],
  opts: AlignOptions = {},
): SectionRank {
  if (!words.length || !doc.sections.length)
    return { index: -1, coverage: 0, margin: 0, scores: doc.sections.map(() => 0) };
  const pre = prepare(doc.sections, words, opts);
  const scores = doc.sections.map((s) => align(s, pre, true).content);
  let index = 0;
  scores.forEach((s, i) => {
    if (s > scores[index]) index = i;
  });
  const second = Math.max(0, ...scores.filter((_, i) => i !== index));
  return { index, coverage: scores[index], margin: scores[index] - second, scores };
}

/** Whether the person should confirm the section picked automatically. */
export const needsConfirmation = (rank: SectionRank): boolean =>
  rank.index >= 0 && (rank.coverage < CONFIRM_COVERAGE || rank.margin < CONFIRM_MARGIN);

/** The section whose narration best matches the recording, or -1 when none clearly does. */
export function bestSection(
  doc: ScriptDoc,
  words: TimelineWord[],
  opts: AlignOptions = {},
): number {
  const rank = rankSections(doc, words, opts);
  return rank.coverage > 0.15 ? rank.index : -1;
}

/** Share of the words spoken that fall outside the script. */
export const offScriptShare = (a: Alignment): number =>
  a.spoken ? a.offScript.reduce((n, r) => n + r.words, 0) / a.spoken : 0;
