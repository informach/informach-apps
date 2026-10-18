import type { AnnotationKind } from "./annotation.ts";
import { strip, type TimelineWord } from "./cleanup.ts";
import type { ScriptSection } from "./script.ts";
import type { Alignment } from "./scriptAlign.ts";

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

export interface ScreenDirectionOptions {
  /** Timeline words, to anchor each annotation on the first word of its line. */
  words?: readonly TimelineWord[];
  /** Where the recording pointed (timeline seconds, frame fractions): clicks, guided targets. */
  targets?: readonly { t: number; x: number; y: number }[];
  rules?: readonly DirectionRule[];
  avoid?: readonly AvoidBox[];
}

export interface DirectionAnnotation {
  /** Index into section.items of the direction. */
  item: number;
  /** The direction as written. */
  direction: string;
  /** Timeline second: the start of the line after it. */
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
const WAIT = /\b(pausa[rd]?|pause|aguard\w*|esper[ae]\w*)\b/i;
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

const tokens = (s: string): string[] =>
  s
    .split(/\s+/)
    .map(strip)
    .filter((w) => w.length >= 3);

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

/** The first safe spot that covers none of `avoid` while [at, end) lasts. */
export function safeSpot(avoid: readonly AvoidBox[], at: number, end: number): [number, number] {
  return (
    SAFE_SPOTS.find(([x, y]) => !avoid.some((a) => overlaps(a, x, y, at, end))) ?? SAFE_SPOTS[0]
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
    if (it.kind !== "screen" || it.insertId || WAIT.test(it.text)) return;
    const next = said.find((l) => l.item > index);
    if (next?.start === undefined) return;
    const at = next.start;
    const word = opts.words?.find((w) => w.start >= at - 0.05);
    const following = said.find((l) => l.item > next.item);
    const room = following?.start !== undefined ? following.start - at : DIRECTION_SECONDS;
    const rule = opts.rules?.find((r) => r.do.annotation && ruleMatches(r, it.text));
    const spec = rule?.do.annotation;
    const duration = Math.max(1, Math.min(spec?.duration ?? DIRECTION_SECONDS, room));
    const target = opts.targets?.find((p) => p.t >= at - 0.25 && p.t <= at + TARGET_WINDOW);
    const quoted = QUOTED.exec(it.text)?.[1]?.trim();
    const kind: AnnotationKind = spec?.kind ?? (target ? "highlight" : quoted ? "label" : "note");
    const text = kind === "highlight" ? undefined : (quoted ?? short(it.text));
    const place: { x: number; y: number; from: DirectionAnnotation["from"] } = target
      ? { x: target.x, y: target.y, from: "target" }
      : spec?.x !== undefined && spec.y !== undefined
        ? { x: spec.x, y: spec.y, from: "rule" }
        : (() => {
            const [x, y] = safeSpot(opts.avoid ?? [], at, at + duration);
            return { x, y, from: "safe" as const };
          })();
    out.push({
      item: index,
      direction: it.text,
      at,
      ...(word ? { key: word.key } : {}),
      duration,
      kind,
      ...(text ? { text } : {}),
      x: place.x,
      y: place.y,
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
