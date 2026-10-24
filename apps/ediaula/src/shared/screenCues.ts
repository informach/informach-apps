import type { ScriptSection } from "./script.ts";
import type { LineMatch } from "./scriptAlign.ts";

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

/** A word as compared: lower case, no accents, letters and digits only. */
const fold = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

/** How early a cue shows before its words are heard. */
const LEAD = 0.5;

/** Timeline second the phrase starts being said at or after `from`, or null. */
function phraseAt(
  words: readonly { start: number; text: string }[],
  phrase: string,
  from: number,
): number | null {
  const wanted = phrase.split(/\s+/).map(fold).filter(Boolean);
  if (!wanted.length) return null;
  const said = words.map((w) => ({ start: w.start, key: fold(w.text) })).filter((w) => w.key);
  for (let i = 0; i + wanted.length <= said.length; i++) {
    if (said[i].start < from) continue;
    if (wanted.every((key, k) => said[i + k].key === key)) return said[i].start;
  }
  return null;
}

export function screenCueTimes(
  section: ScriptSection,
  lines: readonly LineMatch[],
  words: readonly { start: number; text: string }[],
): TimedCue[] {
  const out: TimedCue[] = [];
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
        const said = phraseAt(words, cue.anchor, from);
        if (said !== null) {
          t = Math.max(0, said - LEAD);
          from = said + 0.01;
        }
      }
      out.push({ t, text: cue.text });
    }
  });
  return out;
}
