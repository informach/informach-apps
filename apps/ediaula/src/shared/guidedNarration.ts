import { type ScriptSection, speechItems } from "./script.ts";
import type { Alignment } from "./scriptAlign.ts";
import { isUnrecorded } from "./voiceTakes.ts";

/**
 * "Narrar intervalo" guided by the script: the teleprompter shows the lines of the stretch, the
 * person moves to the next line while watching the preview, and each line of the take is placed
 * on the timeline (as a draft) where it belongs: at the step of the guided recording or the "Na
 * tela" moment closest to where the person said it, never over the line before.
 */

/** A line read in the stretch: its place in the script and its words. */
export interface NarrationLine {
  /** Index into section.items. */
  item: number;
  /** Index among the section's speech lines. */
  line: number;
  speaker: string;
  text: string;
  /** Where it is said in the lesson now, when it is (timeline seconds). */
  at?: number;
}

/** A line found on the timeline counts with this share of its words. */
const FOUND = 0.5;

/**
 * The lines of `section` for the stretch [start, end]: the ones said inside it now, and the ones
 * not in the lesson whose place (between the lines found before and after them) falls inside it.
 * When nothing of the section is on the timeline (a silent screen recording), every line the
 * teacher reads. The presenter's lines and the Zappy's are never read here.
 */
export function intervalLines(
  section: ScriptSection,
  alignment: Alignment | null,
  start: number,
  end: number,
): NarrationLine[] {
  const speech = speechItems(section);
  const found = new Map<number, number>();
  for (const l of alignment?.lines ?? [])
    if (l.start !== undefined && l.matched / Math.max(1, l.total) >= FOUND)
      found.set(l.item, l.start);
  const lines: NarrationLine[] = speech.flatMap((it, line) =>
    it.avatar || isUnrecorded(it)
      ? []
      : [
          {
            item: section.items.indexOf(it),
            line,
            speaker: it.speaker,
            text: it.text,
            ...(found.has(section.items.indexOf(it))
              ? { at: found.get(section.items.indexOf(it)) }
              : {}),
          },
        ],
  );
  if (!found.size) return lines;
  const placed = [...found.entries()].sort((a, b) => a[0] - b[0]);
  return lines.filter((l) => {
    if (l.at !== undefined) return l.at >= start - 0.25 && l.at < end;
    // Between the line found before it and the one found after it.
    const before = [...placed].reverse().find(([item]) => item < l.item)?.[1] ?? 0;
    const after = placed.find(([item]) => item > l.item)?.[1] ?? Number.POSITIVE_INFINITY;
    return before < end && after > start;
  });
}

/** A line of the take: where the person moved to it, in seconds of the take. */
export interface TakeMark {
  item: number;
  text: string;
  /** Second of the take the line appeared on the teleprompter. */
  mark: number;
}

export interface PlacedLine {
  item: number;
  /** Stretch of the take, seconds of the take file. */
  src: { start: number; end: number };
  /** Timeline second it starts at. */
  at: number;
  /** It moved to a guided step or a "Na tela" moment. */
  snapped: boolean;
}

/** A line moves to an anchor (step or "Na tela") at most this far from where it was said. */
export const SNAP_SECONDS = 2.5;
/** Room left between two lines placed one after the other. */
const BREATH = 0.15;

/**
 * Where each line of the take goes. The stretch of a line is from its mark to the next one (or
 * to the end of the take); inside it, `find` (the line's words in the take's transcript) gives
 * the exact words when there is a transcript. It starts on the timeline where it was said while
 * the preview played (the stretch start plus its place in the take), moved to the closest anchor
 * within SNAP_SECONDS, and never before the end of the line before it.
 */
export function placeNarration(opts: {
  start: number;
  marks: readonly TakeMark[];
  takeLength: number;
  anchors: readonly number[];
  find?: (text: string, from: number, to: number) => { start: number; end: number } | null;
}): PlacedLine[] {
  const marks = [...opts.marks].sort((a, b) => a.mark - b.mark);
  const anchors = [...opts.anchors].sort((a, b) => a - b);
  const out: PlacedLine[] = [];
  let free = opts.start;
  marks.forEach((m, i) => {
    const to = marks[i + 1]?.mark ?? opts.takeLength;
    if (to - m.mark < 0.2) return;
    const src = opts.find?.(m.text, m.mark, to) ?? { start: m.mark, end: to };
    const said = opts.start + src.start;
    const near = anchors
      .filter((a) => Math.abs(a - said) <= SNAP_SECONDS && a >= free - 1e-6)
      .sort((a, b) => Math.abs(a - said) - Math.abs(b - said))[0];
    const at = Math.max(free, near ?? said);
    out.push({ item: m.item, src, at, snapped: near !== undefined && at === near });
    free = at + (src.end - src.start) + BREATH;
  });
  return out;
}
