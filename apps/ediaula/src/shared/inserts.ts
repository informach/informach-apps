import type { TimelineWord } from "./cleanup.ts";
import type { ScriptSection, SpeechItem } from "./script.ts";
import { type Alignment, alignSection } from "./scriptAlign.ts";
import { clipEnd, newId, splitClip } from "./timeline.ts";
import type { Clip, Transcript } from "./types.ts";

/**
 * Avatar inserts from the script (F1P1-D01…): the avatar's line is found in a transcribed media
 * (the HeyGen render) and placed between the narration line before it and the one after it.
 * Rule from the scripts: the avatar enters, speaks and leaves before the next answer, without
 * voices overlapping. When the recorded pause is too short, the timeline is opened there.
 */

/** Silence kept before and after the avatar's line. */
export const INSERT_PAD = 0.25;

export interface InsertSource {
  assetId: string;
  /** Span of the line in the source file, seconds. */
  start: number;
  end: number;
}

/** Finds `line` in the transcripts (source time); at least 60% of its words in order. */
export function findLine(
  line: string,
  transcripts: Map<string, Transcript>,
  exclude: Set<string> = new Set(),
): InsertSource | null {
  const section: ScriptSection = {
    number: "",
    title: "",
    items: [{ kind: "speech", speaker: "", avatar: true, text: line }],
  };
  let best: (InsertSource & { score: number }) | null = null;
  for (const [assetId, tr] of transcripts) {
    if (exclude.has(assetId)) continue;
    const words: TimelineWord[] = tr.words.map((w, i) => ({
      key: `${assetId}:${i}`,
      clipId: "",
      text: w.text,
      start: w.start,
      end: w.end,
      p: w.p,
    }));
    const m = alignSection(section, words).lines[0];
    if (!m || m.start === undefined || m.end === undefined) continue;
    const score = m.matched / Math.max(1, m.total);
    // A line found spread over minutes is a coincidence of common words, not the line.
    if (score >= 0.6 && m.end - m.start < m.total * 1.2 + 2 && (!best || score > best.score))
      best = { assetId, start: m.start, end: m.end, score };
  }
  return best && { assetId: best.assetId, start: best.start, end: best.end };
}

export interface InsertPlan {
  /** Timeline time where the avatar clip starts. */
  at: number;
  /** Length of the avatar clip on the timeline. */
  duration: number;
  /** Seconds to open in the timeline at `cut` (0 when the recorded pause is long enough). */
  gap: number;
  cut: number;
}

/**
 * Where the avatar line `item` of `section` goes, given the current alignment: right after the
 * previous narration line ends, needing `lineSeconds` plus padding before the next line starts.
 */
export function planInsert(
  section: ScriptSection,
  alignment: Alignment,
  item: SpeechItem,
  lineSeconds: number,
): InsertPlan | { error: string } {
  const idx = section.items.indexOf(item);
  const placed = alignment.lines.filter(
    (l) => l.start !== undefined && l.matched / Math.max(1, l.total) >= 0.5,
  );
  const before = [...placed]
    .reverse()
    .find((l) => l.item < idx && !(section.items[l.item] as SpeechItem).avatar);
  const after = placed.find((l) => l.item > idx && !(section.items[l.item] as SpeechItem).avatar);
  if (!before && !after)
    return {
      error:
        "Não achei na gravação as falas em volta desta inserção. Transcreva a narração primeiro.",
    };
  const duration = lineSeconds + 2 * INSERT_PAD;
  if (!before) {
    const at = Math.max(0, after!.start! - duration);
    return { at, duration, gap: Math.max(0, duration - after!.start!), cut: 0 };
  }
  const prevEnd = before.end!;
  const nextStart = after?.start ?? Infinity;
  const pause = nextStart - prevEnd;
  const gap = Math.max(0, duration - pause);
  // Open the timeline in the middle of the existing pause, never inside a word.
  const cut = gap > 0 ? prevEnd + Math.min(0.15, pause / 2) : prevEnd;
  return { at: gap > 0 ? cut : prevEnd, duration, gap, cut };
}

/**
 * Opens `gap` seconds at time `t` on `tracks`: clips crossing `t` are split and everything after
 * moves right. Clips on other tracks only move if they start after `t` (a music bed underneath
 * keeps playing). Clips on `locked` tracks never move nor split; the ones crossing `t` come back
 * in `blocked`, since opening the timeline there would pull the rest out of sync with them.
 * Returns the clips and the ids of clips that were split (left parts).
 */
export function openGap(
  clips: Clip[],
  t: number,
  gap: number,
  tracks: Set<string>,
  locked: Set<string> = new Set(),
): { clips: Clip[]; split: Clip[]; blocked: Clip[] } {
  const out: Clip[] = [];
  const split: Clip[] = [];
  const blocked: Clip[] = [];
  for (const c of clips) {
    if (locked.has(c.trackId)) {
      if (c.start < t - 1e-6 && clipEnd(c) > t + 1e-6) blocked.push(c);
      out.push(c);
    } else if (c.start >= t - 1e-6) out.push({ ...c, start: c.start + gap });
    else if (tracks.has(c.trackId) && clipEnd(c) > t + 1e-6) {
      const parts = splitClip(c, t);
      if (parts) {
        out.push(parts[0], { ...parts[1], start: parts[1].start + gap });
        split.push(parts[0]);
      } else out.push(c);
    } else out.push(c);
  }
  return { clips: out, split, blocked };
}

/** A clip of the avatar line, to be placed with the avatar's default placement and fades. */
export function insertClip(
  src: InsertSource,
  trackId: string,
  plan: InsertPlan,
  insertId?: string,
): Clip {
  return {
    id: newId("c"),
    assetId: src.assetId,
    trackId,
    start: plan.at,
    in: Math.max(0, src.start - INSERT_PAD),
    duration: plan.duration,
    volume: 1,
    ...(insertId ? { insertId } : {}),
  };
}
