import { strip, type TimelineWord } from "./cleanup.ts";
import type { ScriptDoc, ScriptSection } from "./script.ts";

/**
 * Lines up a script section with what was actually said on the timeline (longest common
 * subsequence of normalized words). When a passage was recorded more than once, the LAST take
 * is the one matched, which is how retakes are usually done; everything spoken that is not in
 * the script (false starts, retakes, comments) comes back as off-script runs to review.
 */

export interface LineMatch {
  /** Index into section.items. */
  item: number;
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
}

export interface Alignment {
  lines: LineMatch[];
  offScript: OffScript[];
  /** Fraction of the script's words found in the recording. */
  coverage: number;
}

const NUMBERS: Record<string, string> = {
  "0": "zero",
  "1": "um",
  "2": "dois",
  "3": "tres",
  "4": "quatro",
  "5": "cinco",
  "6": "seis",
  "7": "sete",
  "8": "oito",
  "9": "nove",
  "10": "dez",
  uma: "um",
  duas: "dois",
};

const norm = (w: string): string => {
  const s = strip(w);
  return NUMBERS[s] ?? s;
};

const tokens = (text: string): string[] => text.split(/\s+/).map(norm).filter(Boolean);

/** Off-script runs shorter than this many words are left to the filler cleanup. */
const MIN_RUN = 3;

function lcs(a: string[], b: string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return [];
  const w = m + 1;
  const dp = new Uint16Array((n + 1) * w);
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      dp[i * w + j] =
        a[i - 1] === b[j - 1]
          ? dp[(i - 1) * w + j - 1] + 1
          : Math.max(dp[(i - 1) * w + j], dp[i * w + j - 1]);
  // Walking back from the end matches the latest occurrence first: the last take wins.
  const pairs: [number, number][] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1] && dp[i * w + j] === dp[(i - 1) * w + j - 1] + 1) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[(i - 1) * w + j] >= dp[i * w + j - 1]) i--;
    else j--;
  }
  return pairs.reverse();
}

export function alignSection(section: ScriptSection, words: TimelineWord[]): Alignment {
  const scriptTokens: string[] = [];
  const owner: number[] = [];
  const lines: LineMatch[] = [];
  section.items.forEach((it, idx) => {
    if (it.kind !== "speech") return;
    const t = tokens(it.text);
    lines.push({ item: idx, matched: 0, total: t.length });
    for (const tok of t) {
      scriptTokens.push(tok);
      owner.push(lines.length - 1);
    }
  });
  const spoken = words.map((w) => norm(w.text));
  const pairs = lcs(spoken, scriptTokens);

  const used = new Uint8Array(words.length);
  for (const [ti, si] of pairs) {
    used[ti] = 1;
    const line = lines[owner[si]];
    const w = words[ti];
    line.matched++;
    line.start = line.start === undefined ? w.start : Math.min(line.start, w.start);
    line.end = line.end === undefined ? w.end : Math.max(line.end, w.end);
  }

  const offScript: OffScript[] = [];
  let run: TimelineWord[] = [];
  const flush = (): void => {
    const real = run.filter((w) => norm(w.text));
    if (real.length >= MIN_RUN)
      offScript.push({
        start: run[0].start,
        end: run[run.length - 1].end,
        text: run.map((w) => w.text).join(" "),
        words: real.length,
      });
    run = [];
  };
  words.forEach((w, i) => {
    if (used[i]) {
      flush();
      return;
    }
    // A long pause splits two unrelated off-script passages.
    if (run.length && w.start - run[run.length - 1].end > 1.5) flush();
    run.push(w);
  });
  flush();

  return {
    lines,
    offScript,
    coverage: scriptTokens.length ? pairs.length / scriptTokens.length : 0,
  };
}

/** The section whose narration best matches the recording (by share of its words spoken). */
export function bestSection(doc: ScriptDoc, words: TimelineWord[]): number {
  if (!words.length) return -1;
  let best = -1;
  let score = 0.15;
  doc.sections.forEach((s, i) => {
    const a = alignSection(s, words);
    if (a.coverage > score) {
      score = a.coverage;
      best = i;
    }
  });
  return best;
}
