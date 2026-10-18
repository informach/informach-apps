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

/**
 * A number or a name said differently from the script inside a line ("sobe 4" where the script
 * says 3): not a paraphrase to let go, but something to check.
 */
export interface Substitution {
  /** Index into Alignment.lines. */
  line: number;
  said: string;
  written: string;
  /** Timeline time of what was said. */
  start: number;
}

export interface Alignment {
  lines: LineMatch[];
  offScript: OffScript[];
  /** Numbers and names said differently from the script, inside matched lines. */
  substitutions: Substitution[];
  /** Fraction of the script's tokens found in the recording. */
  coverage: number;
  /** The same, leaving articles and prepositions out (rankSections compares sections by it). */
  content: number;
  /** Words spoken on the timeline (with letters or digits). */
  spoken: number;
  /** Of those, the ones no line of the section was aligned with. */
  unaligned: number;
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
/** Takes of a line are told apart at a pause this long, or at the end of a sentence. */
const TAKE_PAUSE = 0.8;
/** A take is at most this many times the words of its line (plus TAKE_SLACK): never two takes. */
const TAKE_LENGTH = 1.3;
const TAKE_SLACK = 3;
/** The latest take with at least this share of the best take's score is the one kept. */
const TAKE_SHARE = 0.8;
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
/** Word k of `list` is written with a capital in the middle of a sentence: a name. */
const isName = (list: readonly string[], k: number): boolean =>
  k > 0 &&
  /^["“(]?\p{Lu}/u.test(list[k]?.trim() ?? "") &&
  !/[.!?…:]["”')\]]*$/.test(list[k - 1].trim());
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
    const tokens = tokenize(termText(t));
    // Only real words of a name by sound: "da" of "Mapa da Aventura" is not one.
    for (const tok of tokens) if (tok.tok.length >= 4 && !tok.stop) terms.add(tok.tok);
    const term = tokens.map((x) => x.tok);
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

/** Script tokens ready to be scored against any spoken token (rows are made once per token). */
interface ScriptIndex {
  cols: Int32Array;
  row(spoken: string): Uint8Array;
}

function scriptIndex(script: readonly string[], g: Glossary): ScriptIndex {
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
  const row = (raw: string): Uint8Array => {
    let found = known.get(raw);
    if (!found) {
      const tok = g.alias.get(raw) ?? raw;
      found = new Uint8Array(uniqueScript.length);
      if (!/\d|%/.test(tok))
        for (const d of deletions(phoneticKey(tok)))
          for (const candidate of near.get(d) ?? [])
            if (!found[candidate] && fuzzyEqual(tok, uniqueScript[candidate], g.terms))
              found[candidate] = 1;
      const exact = scriptIds.get(tok);
      if (exact !== undefined) found[exact] = 2;
      known.set(raw, found);
    }
    return found;
  };
  return { cols, row };
}

function scorer(spoken: readonly string[], script: readonly string[], g: Glossary): Scores {
  const index = scriptIndex(script, g);
  return { rows: spoken.map(index.row), cols: index.cols };
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

/** The best in-order match of `run` against a line: its pairs and its score (2 exact, 1 not). */
function bestMatch(
  run: readonly string[],
  line: ScriptIndex,
): { pairs: [number, number][]; score: number } {
  const scores = { rows: run.map(line.row), cols: line.cols };
  const pairs = lcs(scores);
  let score = 0;
  for (const [i, j] of pairs) score += scores.rows[i][scores.cols[j]];
  return { pairs, score };
}

const isNumberToken = (tok: string): boolean => /\d/.test(tok);

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
  /** Each line's words as written (the src of its tokens points into them). */
  const lineWords: string[][] = [];
  section.items.forEach((it, idx) => {
    if (it.kind !== "speech") return;
    const written = it.text.split(/\s+/).filter(Boolean);
    const t = tokenize(written, { compounds });
    lines.push({ item: idx, matched: 0, total: t.length });
    lineTokens.push(t.map((x) => x.tok));
    lineWords.push(written);
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
  // The first token of each word, to take the tokens of a stretch of words.
  const firstToken = new Int32Array(words.length + 1).fill(tokens.length);
  for (let t = tokens.length - 1; t >= 0; t--)
    for (const wi of tokens[t].src) firstToken[wi] = Math.min(firstToken[wi], t);
  for (let wi = words.length - 1; wi >= 0; wi--)
    firstToken[wi] = Math.min(firstToken[wi], firstToken[wi + 1]);
  const lastWordOf = (t: number): number => tokens[t].src[tokens[t].src.length - 1];
  const spokenTexts = words.map((w) => w.text);

  // Where each line was matched by the alignment of the whole section: its words lie between
  // the lines around it, and in there its takes are told apart.
  const byLine: Pair[][] = lines.map(() => []);
  for (const pair of pairs) byLine[owner[pair[1]]].push(pair);
  const firstAt = byLine.map((list) => (list.length ? tokens[list[0][0]].src[0] : -1));
  const lastAt = byLine.map((list) => (list.length ? lastWordOf(list[list.length - 1][0]) : -1));
  const used = new Uint8Array(words.length);
  const spans: Pair[] = [];
  const substitutions: Substitution[] = [];
  let matchedAll = 0;
  let contentMatched = 0;
  const lineStart: number[] = [];
  {
    let at = 0;
    for (const lt of lineTokens) {
      lineStart.push(at);
      at += lt.length;
    }
  }
  byLine.forEach((list, li) => {
    if (!list.length) return;
    const line = lines[li];
    if (scoreOnly) {
      // Ranking sections only needs how much of each line was found.
      line.matched = list.length;
      matchedAll += list.length;
      for (const [, si] of list) if (!script[si].stop) contentMatched++;
      return;
    }
    const maxWords = Math.ceil(lineWords[li].length * TAKE_LENGTH) + TAKE_SLACK;
    let lo = 0;
    for (let k = li - 1; k >= 0; k--)
      if (lastAt[k] >= 0) {
        lo = lastAt[k] + 1;
        break;
      }
    let hi = words.length - 1;
    for (let k = li + 1; k < lines.length; k++)
      if (firstAt[k] >= 0) {
        hi = firstAt[k] - 1;
        break;
      }
    // Earlier takes are said near the one the alignment found, never pages away.
    lo = Math.max(lo, firstAt[li] - 3 * maxWords);
    hi = Math.min(hi, lastAt[li] + 3 * maxWords);
    // Blocks of speech in the line's stretch, split at long pauses and at sentence ends.
    const blocks: Pair[] = [];
    for (let wi = lo; wi <= hi; wi++) {
      const cur = blocks[blocks.length - 1];
      const breakBefore =
        !cur ||
        words[wi].start - words[wi - 1].end >= TAKE_PAUSE ||
        /[.!?…]["”')\]]*$/.test(words[wi - 1].text.trim());
      if (breakBefore) blocks.push([wi, wi]);
      else cur[1] = wi;
    }
    const index = scriptIndex(lineTokens[li], glossary);
    // Every run of whole blocks short enough to be one take, with its best match to the line.
    const runs: { from: number; to: number; pairs: Pair[]; score: number }[] = [];
    for (let a = 0; a < blocks.length; a++)
      for (let b = a; b < blocks.length; b++) {
        const from = blocks[a][0];
        const to = blocks[b][1];
        if (to - from + 1 > maxWords) break;
        const t0 = firstToken[from];
        const t1 = firstToken[to + 1];
        if (t1 <= t0) continue;
        const run = tokens.slice(t0, t1).map((t) => t.tok);
        const m = bestMatch(run, index);
        if (m.score)
          runs.push({ from, to, score: m.score, pairs: m.pairs.map(([i, j]) => [i + t0, j]) });
      }
    if (!runs.length) return;
    const top = Math.max(...runs.map((r) => r.score));
    // The latest take that is nearly as good as the best one; then the fuller, then the shorter.
    const take = runs
      .filter((r) => r.score >= top * TAKE_SHARE)
      .sort((x, y) => y.to - x.to || y.score - x.score || x.to - x.from - (y.to - y.from))[0];
    let start = Number.POSITIVE_INFINITY;
    let end = Number.NEGATIVE_INFINITY;
    let first = Number.POSITIVE_INFINITY;
    let last = -1;
    for (const [ti, j] of take.pairs) {
      for (const wi of tokens[ti].src) {
        used[wi] = 1;
        start = Math.min(start, words[wi].start);
        end = Math.max(end, words[wi].end);
        first = Math.min(first, wi);
        last = Math.max(last, wi);
      }
      line.matched++;
      if (!script[lineStart[li] + j].stop) contentMatched++;
    }
    matchedAll += line.matched;
    line.start = start;
    line.end = end;
    spans.push([first, last]);
    // Between two matched words, a number or a name said where the script has another one.
    for (let k = 1; k < take.pairs.length; k++) {
      const [t0, j0] = take.pairs[k - 1];
      const [t1, j1] = take.pairs[k];
      const saidToks = tokens.slice(t0 + 1, t1);
      const wrote = script.slice(lineStart[li] + j0 + 1, lineStart[li] + j1);
      if (!saidToks.length || !wrote.length) continue;
      const salient = (t: SpeechToken): boolean =>
        (isNumberToken(t.tok) && !t.stop) || glossary.terms.has(t.tok);
      const said = saidToks.filter((t) => salient(t) || isName(spokenTexts, t.src[0]));
      const written = wrote.filter((t) => salient(t) || isName(lineWords[li], t.src[0]));
      if (!said.length || !written.length) continue;
      const saidText = [...new Set(saidToks.flatMap((t) => t.src))]
        .map((wi) => words[wi].text)
        .join(" ");
      const writtenText = [...new Set(wrote.flatMap((t) => t.src))]
        .map((wi) => lineWords[li][wi])
        .join(" ");
      substitutions.push({
        line: li,
        said: saidText.replace(/[^\p{L}\p{N}%+-]+$/u, ""),
        written: writtenText.replace(/[^\p{L}\p{N}%+-]+$/u, ""),
        start: words[saidToks[0].src[0]].start,
      });
    }
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
    substitutions,
    coverage: script.length ? matchedAll / script.length : 0,
    content: content ? contentMatched / content : 0,
    spoken: words.filter(hasText).length,
    unaligned: words.filter((w, i) => !used[i] && hasText(w)).length,
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

/** Share of the words spoken that no line of the script was aligned with. */
export const offScriptShare = (a: Alignment): number => (a.spoken ? a.unaligned / a.spoken : 0);

/** A direction that asks to wait ("pausar para a pessoa testar", "aguardar a atualização"). */
const WAIT_DIRECTION = /\b(pausa[rd]?|pause|aguard\w*|esper[ae]\w*)\b/i;

/** Whether a section asks for pauses anywhere in its directions. */
export const hasPauseDirections = (section: ScriptSection): boolean =>
  section.items.some((it) => it.kind === "screen" && WAIT_DIRECTION.test(it.text));

/**
 * Where the script asks the recording to wait: between the line before such a direction and the
 * line after it, as said on the timeline. The cleanup leaves a thinking pause there.
 */
export function didacticPauses(section: ScriptSection, alignment: Alignment): [number, number][] {
  const found = alignment.lines.filter(
    (l) => l.start !== undefined && l.end !== undefined && l.matched / Math.max(1, l.total) >= 0.5,
  );
  const out: [number, number][] = [];
  section.items.forEach((it, idx) => {
    if (it.kind !== "screen" || !WAIT_DIRECTION.test(it.text)) return;
    const before = [...found].reverse().find((l) => l.item < idx);
    const after = found.find((l) => l.item > idx);
    if (before?.end !== undefined && after?.start !== undefined && after.start > before.end)
      out.push([before.end, after.start]);
  });
  return out;
}
