import type { AnnotationKind } from "./annotation.ts";
import { strip, type TimelineWord } from "./cleanup.ts";
import { sourceAt } from "./clipTime.ts";
import { clipLayout } from "./compose.ts";
import type { ScriptSection } from "./script.ts";
import type { Alignment } from "./scriptAlign.ts";
import type { Asset, Clip, Project } from "./types.ts";
import { zoomAt } from "./zoom.ts";

/**
 * "Na tela" directions of the script as draft annotations: each one shows when the line said
 * after it starts, so it lands on the moment the screen shows what the direction describes. The
 * place comes from the target the recording pointed at (a click of the guided recording), else
 * from the course template's rules, else from a safe spot that does not cover the presenter.
 */

/** What a course template rule puts on screen for a direction (courseTemplate.ts). */
export interface DirectionRule {
  when: { screenText?: string };
  do: {
    annotation?: {
      kind: AnnotationKind;
      x?: number;
      y?: number;
      color?: string;
      fill?: string;
      fontFamily?: string;
      fontSize?: number;
      duration?: number;
    };
  };
}

/** A frame region a draft annotation must not cover while it lasts (the presenter). */
export interface AvoidBox {
  start: number;
  end: number;
  /** Frame fractions. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Where the recording pointed: a click, a target of the guided recording. */
export interface PointTarget {
  /** Timeline second. */
  t: number;
  /** Frame fractions, as seen at `t`. */
  x: number;
  y: number;
  /** Where the same point is on screen at another timeline second: a zoom of the recording
   *  moves it, and the annotation shows a little before the click. */
  seenAt?: (at: number) => [number, number];
}

export interface ScreenDirectionOptions {
  /** Timeline words, to anchor each annotation on the first word of its line. */
  words?: readonly TimelineWord[];
  targets?: readonly PointTarget[];
  rules?: readonly DirectionRule[];
  avoid?: readonly AvoidBox[];
}

export interface DirectionAnnotation {
  /** Which direction of the script it is (directionId), kept in Annotation.direction. */
  id: string;
  /** Index into section.items of the direction. */
  item: number;
  /** The direction as written. */
  direction: string;
  /** Timeline second: the first word of the line after it, else where that line starts. */
  at: number;
  /** Key of the first word of that line (TimelineWord.key), when the words were given. */
  key?: string;
  duration: number;
  kind: AnnotationKind;
  text?: string;
  x: number;
  y: number;
  style: { color?: string; fill?: string; fontFamily?: string; fontSize?: number };
  /** Where the place came from. */
  from: "target" | "rule" | "safe";
}

/** A line counts as said when at least this share of it was found. */
const SAID = 0.5;
/** A target counts for a direction when it is this close after the line starts (seconds). */
const TARGET_WINDOW = 4;
export const DIRECTION_SECONDS = 3;
// Asking the recording to wait: "pausar", "aguarde", "espere", "espera", "esperar" (not
// "esperança" or "esperto").
const WAIT = /\b(pausa[rd]?|pause|aguard\w*|esper(?:e|a|ar))\b/i;
const QUOTED = /["“”']([^"“”']{2,40})["“”']/;

/** Spots on the frame tried in order when nothing says where (the top edge first). */
const SAFE_SPOTS: [number, number][] = [
  [0.5, 0.12],
  [0.22, 0.14],
  [0.78, 0.14],
  [0.22, 0.82],
  [0.5, 0.86],
  [0.78, 0.82],
];
/** Rough half-size of a text annotation, frame fractions. */
const HALF: [number, number] = [0.16, 0.06];
/** Half-size of the highlight box (260 x 150 px in 1080p). */
const HIGHLIGHT_HALF: [number, number] = [0.07, 0.07];
/** Annotations stay inside the middle 90% of the frame (the title-safe area). */
const SAFE_MARGIN = 0.05;
/** Where a note goes when the presenter fills the frame: a bottom corner, off the face. */
const FULL_FRAME_SPOT: [number, number] = [0.78, 0.84];

/** Which direction of the script an annotation came from: its place and its words. */
export const directionId = (section: Pick<ScriptSection, "number">, item: number, text: string) =>
  `${section.number}:${item}:${text.replace(/\s+/g, " ").trim().slice(0, 120)}`;

/** Moves a center so the annotation stays inside the safe area of the frame. */
export function inSafeArea(
  x: number,
  y: number,
  half: readonly [number, number] = HALF,
): [number, number] {
  const fit = (v: number, h: number): number =>
    Math.max(SAFE_MARGIN + h, Math.min(1 - SAFE_MARGIN - h, v));
  return [fit(x, half[0]), fit(y, half[1])];
}

const tokens = (s: string): string[] =>
  s
    .split(/\s+/)
    .map(strip)
    .filter((w) => w.length >= 3);

/**
 * Where a point of a recording (fractions of its frame) is on the lesson's frame at timeline
 * second `at`: the clip's place, and the recording's own zoom at that moment, as the preview and
 * the export draw it.
 */
export function pointOnFrame(
  c: Clip,
  a: Pick<Asset, "width" | "height" | "zooms">,
  settings: Project["settings"],
  u: number,
  v: number,
  at: number,
): [number, number] {
  const lay = clipLayout(c, a, settings);
  const view = zoomAt(a.zooms, sourceAt(c, at));
  const x = 0.5 + (u - view.cx) * view.scale;
  const y = 0.5 + (v - view.cy) * view.scale;
  return [
    (lay.full.x + x * lay.full.w) / settings.width,
    (lay.full.y + y * lay.full.h) / settings.height,
  ];
}

/** Whether a rule's screen text is in a direction: every word of it (3 letters or more). */
export function ruleMatches(rule: Pick<DirectionRule, "when">, direction: string): boolean {
  const want = tokens(rule.when.screenText ?? "");
  if (!want.length) return false;
  const have = new Set(tokens(direction));
  return want.every((w) => have.has(w));
}

const overlaps = (a: AvoidBox, x: number, y: number, at: number, end: number): boolean =>
  a.start < end &&
  a.end > at &&
  x - HALF[0] < a.x1 &&
  x + HALF[0] > a.x0 &&
  y - HALF[1] < a.y1 &&
  y + HALF[1] > a.y0;

/**
 * The first safe spot that covers none of `avoid` while [at, end) lasts. When every spot covers
 * the presenter (filling the frame), a bottom corner: the face is up.
 */
export function safeSpot(avoid: readonly AvoidBox[], at: number, end: number): [number, number] {
  return (
    SAFE_SPOTS.find(([x, y]) => !avoid.some((a) => overlaps(a, x, y, at, end))) ?? FULL_FRAME_SPOT
  );
}

const short = (s: string, max = 60): string => {
  const clean = s.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.lastIndexOf(" ", max);
  return `${clean.slice(0, cut > 20 ? cut : max)}…`;
};

/**
 * The draft annotations of a section's "Na tela" directions, in timeline order. A direction is
 * left out when it only announces an avatar insert (the inserts step places those), asks the
 * recording to wait, or no line after it was said.
 */
export function screenDirections(
  section: ScriptSection,
  alignment: Alignment,
  opts: ScreenDirectionOptions = {},
): DirectionAnnotation[] {
  const said = alignment.lines.filter(
    (l) => l.start !== undefined && l.matched / Math.max(1, l.total) >= SAID,
  );
  const out: DirectionAnnotation[] = [];
  section.items.forEach((it, index) => {
    // A direction split at the speech it quotes (a production script) is what the person
    // recording does at each phrase, not text for the video: it shows in the recorder only.
    if (it.kind !== "screen" || it.insertId || it.cues || WAIT.test(it.text)) return;
    const next = said.find((l) => l.item > index);
    if (next?.start === undefined) return;
    // The real first word heard of that line, when it is inside the line.
    const word = opts.words?.find(
      (w) => w.start >= (next.start ?? 0) - 0.05 && w.start <= (next.end ?? next.start ?? 0),
    );
    const at = word?.start ?? next.start;
    const following = said.find((l) => l.item > next.item);
    const room = following?.start !== undefined ? following.start - at : DIRECTION_SECONDS;
    const rule = opts.rules?.find((r) => r.do.annotation && ruleMatches(r, it.text));
    const spec = rule?.do.annotation;
    const duration = Math.max(1, Math.min(spec?.duration ?? DIRECTION_SECONDS, room));
    const target = opts.targets?.find((p) => p.t >= at - 0.25 && p.t <= at + TARGET_WINDOW);
    const quoted = QUOTED.exec(it.text)?.[1]?.trim();
    const kind: AnnotationKind = spec?.kind ?? (target ? "highlight" : quoted ? "label" : "note");
    const text = kind === "highlight" ? undefined : (quoted ?? short(it.text));
    const seen = target?.seenAt?.(at) ?? (target ? [target.x, target.y] : null);
    const place: { x: number; y: number; from: DirectionAnnotation["from"] } = seen
      ? { x: seen[0], y: seen[1], from: "target" }
      : spec?.x !== undefined && spec.y !== undefined
        ? { x: spec.x, y: spec.y, from: "rule" }
        : (() => {
            const [x, y] = safeSpot(opts.avoid ?? [], at, at + duration);
            return { x, y, from: "safe" as const };
          })();
    // A click near the edge still puts the whole annotation on screen.
    const [x, y] = inSafeArea(place.x, place.y, kind === "highlight" ? HIGHLIGHT_HALF : HALF);
    out.push({
      id: directionId(section, index, it.text),
      item: index,
      direction: it.text,
      at,
      ...(word ? { key: word.key } : {}),
      duration,
      kind,
      ...(text ? { text } : {}),
      x,
      y,
      style: {
        ...(spec?.color ? { color: spec.color } : {}),
        ...(spec?.fill ? { fill: spec.fill } : {}),
        ...(spec?.fontFamily ? { fontFamily: spec.fontFamily } : {}),
        ...(spec?.fontSize ? { fontSize: spec.fontSize } : {}),
      },
      from: place.from,
    });
  });
  return out.sort((a, b) => a.at - b.at);
}

/** Keeps at most `perMinute` annotations in any minute of the lesson, the earliest first. */
export function capPerMinute<T extends { at: number }>(list: readonly T[], perMinute: number): T[] {
  if (!(perMinute > 0)) return [...list];
  const kept: T[] = [];
  for (const a of list) {
    const inMinute = kept.filter((k) => a.at - k.at < 60).length;
    if (inMinute < perMinute) kept.push(a);
  }
  return kept;
}
