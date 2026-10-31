import type { TimelineWord } from "./cleanup.ts";
import { clipEnd } from "./clipTime.ts";
import { findPhrase, joinStretches } from "./phrase.ts";
import type { ScriptDoc, ScriptSection } from "./script.ts";
import { alignSection, type LineMatch } from "./scriptAlign.ts";
import type { Project } from "./types.ts";

/**
 * When each "Na tela" shows while the screen is recorded over the narration ("Tela sobre a
 * narração"). A plain direction applies from the start of the line after it (or the end of the
 * one before), half a second early. A direction of a production script, split at the spoken
 * phrases it quotes (script.ts screenCues), shows each piece when the voice reaches those words:
 * found in order in the transcript from the start of the direction's line, a moment before they
 * are said; a phrase not found keeps the time of the piece before it.
 */

export interface TimedCue {
  t: number;
  text: string;
}

/** How early a cue shows before its words are heard. */
const LEAD = 0.5;

/** A line counts as said when at least this much of it was found in the voice. */
const SAID = 0.5;

const said = (l: LineMatch): boolean => l.matched / Math.max(1, l.total) >= SAID;

export function screenCueTimes(
  section: ScriptSection,
  aligned: readonly LineMatch[],
  words: readonly { start: number; end?: number; text: string }[],
): TimedCue[] {
  const out: TimedCue[] = [];
  // Only lines the voice says: a part of the script that is not in this voice times nothing.
  const lines = aligned.filter(said);
  // An anchor is looked for inside its own part, never in a later one.
  const partEnd = Math.max(...lines.map((l) => l.end ?? l.start ?? 0), 0);
  section.items.forEach((item, index) => {
    if (item.kind !== "screen") return;
    const next = lines.find((l) => l.item > index && l.start !== undefined);
    const prev = [...lines].reverse().find((l) => l.item < index && l.end !== undefined);
    const at = next?.start ?? prev?.end;
    if (at === undefined) return;
    const t0 = Math.max(0, at - LEAD);
    if (!item.cues?.length) {
      out.push({ t: t0, text: item.text });
      return;
    }
    let t = t0;
    let from = Math.max(0, at - 1);
    for (const cue of item.cues) {
      if (cue.anchor) {
        const found = findPhrase(
          words.map((w) => ({ text: w.text, start: w.start, end: w.end ?? w.start })),
          cue.anchor,
          { from, to: partEnd },
        );
        if (found) {
          t = Math.max(0, found.start - LEAD);
          from = found.start + 0.01;
        }
      }
      out.push({ t, text: cue.text });
    }
  });
  return out;
}

/** A line of the script where the voice says it, and the part of the script it is in. */
export interface ScriptPlace {
  t: number;
  text: string;
  part: string;
}

/**
 * The voice against the whole script: every part aligned with the words (a voice made once for
 * the whole lesson holds all of them), giving the "Na tela" of every part at its time and every
 * line said, in order, as a place to start a take from.
 */
export function scriptGuide(
  doc: ScriptDoc,
  words: readonly TimelineWord[],
): { cues: TimedCue[]; places: ScriptPlace[] } {
  const cues: TimedCue[] = [];
  const places: ScriptPlace[] = [];
  for (const section of doc.sections) {
    const lines = alignSection(section, [...words]).lines;
    cues.push(...screenCueTimes(section, lines, words));
    const part = `Parte ${section.number}${section.title ? ` · ${section.title}` : ""}`;
    for (const line of lines) {
      const item = section.items[line.item];
      if (item?.kind !== "speech" || line.start === undefined || !said(line)) continue;
      places.push({ t: line.start, text: item.text, part });
    }
  }
  return {
    cues: cues.sort((a, b) => a.t - b.t),
    places: places.sort((a, b) => a.t - b.t),
  };
}

/**
 * Where the lesson already has a recorded screen: the stretches of the screen takes on the
 * timeline, joined. A take started inside one records over it from there.
 */
export function recordedStretches(
  p: Pick<Project, "clips" | "assets" | "tracks">,
): [number, number][] {
  const screens = new Set(p.assets.filter((a) => a.recording?.role === "screen").map((a) => a.id));
  const locked = new Set(p.tracks.filter((t) => t.locked).map((t) => t.id));
  return joinStretches(
    p.clips
      .filter((c) => screens.has(c.assetId) && !locked.has(c.trackId))
      .map((c): [number, number] => [c.start, clipEnd(c)]),
  );
}

/** A line of the script with how much of it already has a recorded screen. */
export interface LineCoverage extends ScriptPlace {
  /** Where the line ends: the next line's start, or the end of the voice. */
  end: number;
  status: "done" | "partial" | "missing";
}

/** How much of the voice already has a recorded screen, line by line. */
export interface ScreenCoverage {
  lines: LineCoverage[];
  /** Lines fully covered. */
  done: number;
  /** Seconds of the voice with a screen, out of `total`. */
  covered: number;
  total: number;
  /** Where the first stretch of the voice without a screen starts (null when there is none). */
  firstGap: number | null;
}

/** A stretch without a screen shorter than this is a seam between two takes, not a gap. */
const GAP = 1;

/** Seconds of [a, b] inside the stretches. */
function coveredIn(
  stretches: readonly (readonly [number, number])[],
  a: number,
  b: number,
): number {
  let sum = 0;
  for (const [x, y] of stretches) sum += Math.max(0, Math.min(b, y) - Math.max(a, x));
  return sum;
}

/**
 * The voice from `start` to `end` against the screen already recorded (recordedStretches): each
 * line of the script (scriptGuide's places) done, partly done or missing, the seconds covered and
 * the first stretch of a second or more still without a screen, where the next take continues.
 */
export function screenCoverage(
  places: readonly ScriptPlace[],
  recorded: readonly (readonly [number, number])[],
  start: number,
  end: number,
): ScreenCoverage {
  const stretches = joinStretches(recorded);
  // A line said once but found in two parts of the script (a greeting) is one place.
  const lines = places
    .filter((p, i, all) => p.t < end && all.findIndex((q) => Math.abs(q.t - p.t) < 1e-3) === i)
    .map((p, i, all): LineCoverage => {
      const from = Math.max(start, p.t);
      const to = Math.max(from, Math.min(end, all[i + 1]?.t ?? end));
      const has = coveredIn(stretches, from, to);
      const length = to - from;
      // As firstGap: less than a second without a screen is a seam, not something missing.
      const least = Math.min(GAP, length / 2);
      // A line with no length (the voice ended on it) is done when its moment has a screen.
      const status =
        length < 1e-3
          ? stretches.some(([x, y]) => x <= from + 1e-3 && y > from)
            ? "done"
            : "missing"
          : length - has < least
            ? "done"
            : has < least
              ? "missing"
              : "partial";
      return { ...p, end: to, status };
    });
  let firstGap: number | null = null;
  let at = start;
  for (const [x, y] of stretches) {
    if (y <= at) continue;
    if (x - at >= GAP) break;
    at = Math.max(at, y);
    if (at >= end) break;
  }
  if (end - at >= GAP) firstGap = at;
  return {
    lines,
    done: lines.filter((l) => l.status === "done").length,
    covered: coveredIn(stretches, start, end),
    total: Math.max(0, end - start),
    firstGap,
  };
}
