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
