import { clipEnd, overwriteRange, sourceAt, sourceEnd, timelineAt } from "./timeline.ts";
import type { Clip, Project, Transcript } from "./types.ts";

/** A transcribed word placed on the timeline. */
export interface TimelineWord {
  /** Stable key: asset + index in that asset's transcript. */
  key: string;
  clipId: string;
  text: string;
  start: number;
  end: number;
  p: number;
}

export type IssueKind = "filler" | "silence" | "repeat";

export interface Issue {
  id: string;
  kind: IssueKind;
  /** Timeline range to remove. */
  start: number;
  end: number;
  /** Keys of the words involved (empty for silences). */
  words: string[];
}

export interface CleanupOptions {
  /** Silences at least this long (seconds) are shortened. */
  minSilence: number;
  /** Pause left in place of a removed silence (seconds). */
  keepPause: number;
}

export const DEFAULT_CLEANUP: CleanupOptions = { minSilence: 1, keepPause: 0.4 };

export const strip = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]/g, "");

/** Words that are hesitations in any context ("né" included: it is almost always a verbal tic). */
const ALWAYS_FILLER = new Set([
  "ahn",
  "ah",
  "han",
  "hum",
  "hm",
  "hmm",
  "humm",
  "uhm",
  "uh",
  "eh",
  "ee",
  "eee",
  "aa",
  "aaa",
  "er",
  "ne",
]);

const trailingPause = (text: string): boolean => /(,|…|\.\.\.)$/.test(text.trim());

function isFiller(words: TimelineWord[], i: number): boolean {
  const w = words[i];
  const raw = w.text.trim();
  const n = strip(raw);
  if (!n) return false;
  if (ALWAYS_FILLER.has(n)) return true;
  const prev = words[i - 1];
  const setOffBefore = !prev || /[,.!?…]$/.test(prev.text) || w.start - prev.end > 0.4;
  // "é" is also the verb "to be" and "e" means "and": only an accented "é" trailing off counts.
  if (n === "e") return /^é/i.test(raw) && trailingPause(raw) && setOffBefore;
  // "tipo" is a filler when set off by commas ("..., tipo, ..."), a noun otherwise.
  if (n === "tipo") return trailingPause(raw) && setOffBefore;
  return false;
}

/** Maps each clip's slice of its source transcript onto the timeline. */
export function timelineWords(
  project: Project,
  transcripts: Map<string, Transcript>,
): TimelineWord[] {
  const out: TimelineWord[] = [];
  for (const c of project.clips) {
    const tr = transcripts.get(c.assetId);
    if (!tr) continue;
    const from = c.in;
    const to = sourceEnd(c);
    tr.words.forEach((w, i) => {
      const mid = (w.start + w.end) / 2;
      if (mid < from || mid >= to) return;
      out.push({
        // The index as recognized: corrections that drop or join words keep the keys stable.
        key: `${c.assetId}:${w.i ?? i}`,
        clipId: c.id,
        text: w.text,
        start: Math.max(c.start, timelineAt(c, w.start)),
        end: Math.min(clipEnd(c), timelineAt(c, w.end)),
        p: w.p,
      });
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Silences of transcribed sources, clipped to what is actually on the timeline. */
export function timelineSilences(
  project: Project,
  transcripts: Map<string, Transcript>,
): [number, number][] {
  const out: [number, number][] = [];
  for (const c of project.clips) {
    const tr = transcripts.get(c.assetId);
    if (!tr) continue;
    for (const [s, e] of tr.silences) {
      const a = Math.max(s, c.in);
      const b = Math.min(e, sourceEnd(c));
      if (b > a) out.push([timelineAt(c, a), timelineAt(c, b)]);
    }
  }
  return out.sort((x, y) => x[0] - y[0]);
}

/** Finds hesitations, repeated phrases and long pauses. */
export function analyze(
  words: TimelineWord[],
  silences: [number, number][],
  opts: CleanupOptions = DEFAULT_CLEANUP,
): Issue[] {
  const issues: Issue[] = [];
  const nextStart = (i: number, fallback: number): number =>
    i + 1 < words.length ? words[i + 1].start : fallback;

  words.forEach((w, i) => {
    if (!isFiller(words, i)) return;
    const end = Math.min(nextStart(i, w.end), w.end + 0.3);
    issues.push({
      id: `f:${w.key}`,
      kind: "filler",
      start: w.start,
      end: Math.max(end - 0.03, w.end),
      words: [w.key],
    });
  });

  // Repeated phrases: when a run of n words is immediately said again, drop the first take.
  // Runs repeatedly over the words that remain so "a b, a b c, a b c" collapses to one "a b c".
  const removed = new Set<number>();
  for (let pass = 0; pass < 4; pass++) {
    const live = words.map((_, i) => i).filter((i) => !removed.has(i));
    let changed = false;
    for (let n = 6; n >= 1 && !changed; n--) {
      for (let k = 0; k + 2 * n <= live.length; k++) {
        const a = live.slice(k, k + n);
        const b = live.slice(k + n, k + 2 * n);
        if (
          !a.every(
            (idx, j) =>
              strip(words[idx].text) && strip(words[idx].text) === strip(words[b[j]].text),
          )
        )
          continue;
        // A single repeated word only counts when the takes are close together (a stutter).
        if (n === 1 && words[b[0]].start - words[a[0]].end > 0.6) continue;
        a.forEach((idx) => {
          removed.add(idx);
        });
        issues.push({
          id: `r:${words[a[0]].key}`,
          kind: "repeat",
          start: words[a[0]].start,
          end: Math.max(words[a[n - 1]].end, words[b[0]].start - 0.03),
          words: a.map((idx) => words[idx].key),
        });
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }

  const half = opts.keepPause / 2;
  for (const [s, e] of silences) {
    if (e - s < opts.minSilence) continue;
    issues.push({
      id: `s:${s.toFixed(3)}`,
      kind: "silence",
      start: s + half,
      end: e - half,
      words: [],
    });
  }
  return issues.sort((a, b) => a.start - b.start);
}

/** Range to remove for a selection of words, extended into the surrounding gaps. */
export function wordsRange(words: TimelineWord[], from: number, to: number): [number, number] {
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  const prev = words[a - 1];
  const next = words[b + 1];
  const start = prev
    ? Math.max(prev.end, words[a].start - 0.06)
    : Math.max(0, words[a].start - 0.06);
  const end = next ? Math.min(next.start - 0.02, words[b].end + 0.06) : words[b].end + 0.06;
  return [start, Math.max(end, words[b].end)];
}

/** Merges overlapping or touching ranges. */
export function mergeRanges(ranges: [number, number][], gap = 0.02): [number, number][] {
  const sorted = ranges.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + gap) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

/**
 * Removes [start, end) from every target track and pulls everything after it left,
 * keeping the tracks in sync. Tracks outside `targets` (locked, music) are left alone.
 */
export function rippleDeleteRange(
  clips: Clip[],
  start: number,
  end: number,
  targets: Set<string>,
): Clip[] {
  const len = end - start;
  if (len <= 0) return clips;
  let out = clips;
  for (const t of targets) out = overwriteRange(out, t, start, end);
  return out.map((c) =>
    targets.has(c.trackId) && c.start >= end - 1e-6 ? { ...c, start: c.start - len } : c,
  );
}

const contentEnd = (clips: Clip[], targets: Set<string>): number => {
  let end = 0;
  for (const c of clips) if (targets.has(c.trackId)) end = Math.max(end, clipEnd(c));
  return end;
};

/**
 * Applies many cuts at once, latest first so earlier positions stay valid. Tracks that are not
 * cut (a music bed) and ran to the end of the lesson are trimmed to the new, shorter end, so
 * the export doesn't continue with a black screen.
 */
export function applyCuts(
  clips: Clip[],
  ranges: [number, number][],
  targets: Set<string>,
  keepTrackIds: Set<string> = new Set(),
): Clip[] {
  return cutSorted(clips, mergeRanges(ranges), targets, keepTrackIds);
}

/** applyCuts() over ranges already sorted and apart from each other. */
function cutSorted(
  clips: Clip[],
  ranges: [number, number][],
  targets: Set<string>,
  keepTrackIds: Set<string>,
): Clip[] {
  const oldEnd = contentEnd(clips, targets);
  let out = clips;
  for (const [s, e] of [...ranges].reverse()) out = rippleDeleteRange(out, s, e, targets);
  const newEnd = contentEnd(out, targets);
  if (newEnd >= oldEnd) return out;
  return out
    .filter((c) => targets.has(c.trackId) || keepTrackIds.has(c.trackId) || c.start < newEnd - 1e-6)
    .map((c) =>
      !targets.has(c.trackId) &&
      !keepTrackIds.has(c.trackId) &&
      clipEnd(c) >= oldEnd - 0.05 &&
      clipEnd(c) > newEnd
        ? { ...c, duration: newEnd - c.start }
        : c,
    );
}

/** Gaps shorter than this (rounding left over by earlier edits) are not worth a cut. */
const MIN_GAP = 1e-4;

/**
 * Closes only the stretches where none of the target tracks has anything, pulling everything
 * after each one left on all of them at once (applyCuts). Balloons, avatar, zoom layers and the
 * voice keep their distance to each other. Tracks outside `targets` are not moved: a music bed
 * ends with the lesson, while `keepTrackIds` (locked tracks) are left exactly as they are.
 */
export function closeCommonGaps(
  project: Pick<Project, "clips">,
  targets: Set<string>,
  keepTrackIds: Set<string> = new Set(),
): Clip[] {
  const busy = mergeRanges(
    project.clips
      .filter((c) => targets.has(c.trackId))
      .map((c): [number, number] => [c.start, clipEnd(c)]),
    0,
  );
  const gaps: [number, number][] = [];
  let cursor = 0;
  for (const [start, end] of busy) {
    if (start - cursor > MIN_GAP) gaps.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  // Already apart: merging them again (applyCuts) could swallow a very short clip between two gaps.
  return gaps.length ? cutSorted(project.clips, gaps, targets, keepTrackIds) : project.clips;
}

/**
 * Tracks that text-based cuts apply to: every unlocked video track, every unlocked audio track
 * carrying speech, and the microphone and computer sound of a recording (they belong to the
 * screen video even before being transcribed). Music beds keep playing under the edit instead
 * of being chopped.
 */
export function cutTargets(project: Project): Set<string> {
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const out = new Set<string>();
  for (const t of project.tracks) {
    if (t.locked) continue;
    const onTrack = project.clips
      .filter((c) => c.trackId === t.id)
      .map((c) => assets.get(c.assetId));
    if (t.music) continue;
    if (
      t.kind === "video" ||
      onTrack.some(
        (a) =>
          a &&
          (a.kind !== "audio" ||
            a.transcript ||
            a.recording?.role === "mic" ||
            a.recording?.role === "system"),
      )
    )
      out.add(t.id);
  }
  return out;
}

/** Groups words into paragraphs at long pauses or after long sentences. */
export function paragraphs(words: TimelineWord[]): TimelineWord[][] {
  const out: TimelineWord[][] = [];
  let cur: TimelineWord[] = [];
  words.forEach((w, i) => {
    const prev = words[i - 1];
    const pause = prev ? w.start - prev.end : 0;
    const sentenceEnd = prev && /[.!?]$/.test(prev.text);
    if (cur.length && (pause > 1.5 || (sentenceEnd && cur.length >= 35))) {
      out.push(cur);
      cur = [];
    }
    cur.push(w);
  });
  if (cur.length) out.push(cur);
  return out;
}

const srtTime = (t: number): string => {
  const ms = Math.round(Math.max(0, t) * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms / 60000) % 60);
  const s = Math.floor((ms / 1000) % 60);
  const p = (v: number, n = 2): string => String(v).padStart(n, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(ms % 1000, 3)}`;
};

/** Subtitle cues of up to two 42-character lines and 6 seconds, breaking at punctuation and pauses. */
export function buildSrt(words: TimelineWord[], removed: Set<string> = new Set()): string {
  const MAX_CHARS = 84;
  const MAX_DUR = 6;
  const cues: { start: number; end: number; text: string }[] = [];
  let cur: TimelineWord[] = [];
  const flush = (): void => {
    if (!cur.length) return;
    const text = cur.map((w) => w.text).join(" ");
    cues.push({ start: cur[0].start, end: cur[cur.length - 1].end, text });
    cur = [];
  };
  let sentenceStart = true;
  for (const raw of words) {
    if (removed.has(raw.key)) continue;
    // Removing a filler can leave a sentence starting in lowercase ("sala. então").
    const w = sentenceStart
      ? { ...raw, text: raw.text.charAt(0).toUpperCase() + raw.text.slice(1) }
      : raw;
    sentenceStart = /[.!?]$/.test(raw.text);
    const prev = cur[cur.length - 1];
    const len = cur.reduce((s, x) => s + x.text.length + 1, 0) + w.text.length;
    if (prev && (len > MAX_CHARS || w.end - cur[0].start > MAX_DUR || w.start - prev.end > 0.8))
      flush();
    cur.push(w);
    if (/[.!?]$/.test(w.text) && cur.length > 3) flush();
  }
  flush();
  const wrap = (t: string): string => {
    if (t.length <= 42) return t;
    const mid = t.lastIndexOf(" ", Math.ceil(t.length / 2) + 4);
    return mid > 0 ? `${t.slice(0, mid)}\n${t.slice(mid + 1)}` : t;
  };
  return cues
    .map(
      (c, i) =>
        `${i + 1}\n${srtTime(c.start)} --> ${srtTime(Math.max(c.end, c.start + 0.8))}\n${wrap(c.text)}\n`,
    )
    .join("\n");
}

/**
 * Finds every occurrence of a quoted passage in the timeline words, ignoring case, accents and
 * punctuation. Returns [firstIndex, lastIndex] pairs.
 */
export function findQuote(words: TimelineWord[], quote: string): [number, number][] {
  const q = quote.split(/\s+/).map(strip).filter(Boolean);
  if (!q.length) return [];
  const w = words.map((x) => strip(x.text));
  const out: [number, number][] = [];
  for (let i = 0; i + q.length <= w.length; i++) {
    let ok = true;
    for (let j = 0; j < q.length && ok; j++) ok = w[i + j] === q[j];
    if (ok) out.push([i, i + q.length - 1]);
  }
  return out;
}

/** Protected source ranges mapped onto the current timeline. */
export function timelineProtected(
  project: Project,
): { id: string; start: number; end: number; label: string }[] {
  const out: { id: string; start: number; end: number; label: string }[] = [];
  for (const pr of project.protected ?? []) {
    for (const c of project.clips) {
      if (c.assetId !== pr.assetId) continue;
      const a = Math.max(pr.start, c.in);
      const b = Math.min(pr.end, sourceEnd(c));
      if (b > a)
        out.push({ id: pr.id, start: timelineAt(c, a), end: timelineAt(c, b), label: pr.label });
    }
  }
  return out.sort((x, y) => x.start - y.start);
}

/** Cuts that would touch a protected range (overlap of more than a few milliseconds). */
export function protectedConflicts(
  project: Project,
  ranges: [number, number][],
): { range: [number, number]; label: string }[] {
  const prot = timelineProtected(project);
  const out: { range: [number, number]; label: string }[] = [];
  for (const r of ranges) {
    const hit = prot.find((p) => Math.min(r[1], p.end) - Math.max(r[0], p.start) > 0.01);
    if (hit) out.push({ range: r, label: hit.label });
  }
  return out;
}

/** Source ranges covered by a run of timeline words (one entry per clip they span). */
export function wordsToSource(
  project: Project,
  words: TimelineWord[],
): { assetId: string; start: number; end: number }[] {
  const clips = new Map(project.clips.map((c) => [c.id, c]));
  const byClip = new Map<string, { assetId: string; start: number; end: number }>();
  for (const w of words) {
    const c = clips.get(w.clipId);
    if (!c) continue;
    const s = sourceAt(c, w.start);
    const e = sourceAt(c, w.end);
    const cur = byClip.get(c.id);
    if (cur) {
      cur.start = Math.min(cur.start, s);
      cur.end = Math.max(cur.end, e);
    } else byClip.set(c.id, { assetId: c.assetId, start: s, end: e });
  }
  return [...byClip.values()];
}
