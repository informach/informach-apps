import { z } from "zod";
import type { ProposalItem } from "./anchors.ts";
import { DEFAULT_CLEANUP, strip } from "./cleanup.ts";
import type { CourseTemplate } from "./courseTemplate.ts";
import type { DiffItem } from "./projectDiff.ts";
import { ruleMatches } from "./screenDirections.ts";

/**
 * "Aprender com a aula anterior": what the person accepted and left out of the proposals and the
 * drafts of a course's lessons, kept in userData/cursos/<curso>/aprendizado.json, and what it
 * changes in the course template for the next lesson (learnedDefaults): the shortest pause cut,
 * the hesitations the teacher says on purpose, and the template's rules the person keeps
 * refusing (the automatic zoom, the cards, annotations for a "Na tela" direction, how many per
 * minute).
 */

export const LEARNING_KINDS = [
  "filler",
  "silence",
  "repeat",
  "off-script",
  "retake",
  "annotation",
  "zoom",
  "card",
] as const;
export type LearningKind = (typeof LEARNING_KINDS)[number];

export interface LearningEvent {
  kind: LearningKind;
  accepted: boolean;
  /** Date.now() of the decision. */
  at: number;
  /** A hesitation: the word said (stripped). */
  word?: string;
  /** A pause: how long it was, whole (seconds). */
  seconds?: number;
  /** An annotation of a "Na tela" direction: the direction's words. */
  direction?: string;
  /** The lesson (project id) it was decided in: one atypical lesson never sets the course. */
  lesson?: string;
}

export interface Learning {
  version: 1;
  events: LearningEvent[];
}

/** The newest decisions kept per course. */
export const LEARNING_LIMIT = 3000;

export const learningSchema = z.object({
  version: z.literal(1),
  events: z
    .array(
      z.object({
        kind: z.enum(LEARNING_KINDS),
        accepted: z.boolean(),
        at: z.number().nonnegative(),
        word: z.string().max(60).optional(),
        seconds: z.number().min(0).max(600).optional(),
        direction: z.string().max(200).optional(),
        lesson: z.string().max(200).optional(),
      }),
    )
    .max(LEARNING_LIMIT),
});

export const emptyLearning = (): Learning => ({ version: 1, events: [] });

/** `learning` with the new decisions, the oldest dropped past LEARNING_LIMIT. */
export function addLearning(learning: Learning, events: readonly LearningEvent[]): Learning {
  return { version: 1, events: [...learning.events, ...events].slice(-LEARNING_LIMIT) };
}

/** Nothing is learned from fewer lessons than this: one atypical lesson does not set the course. */
export const MIN_LESSONS = 2;
/** Each lesson before the newest counts this much less (recent decisions weigh more). */
export const LESSON_DECAY = 0.75;

/** Decisions on pauses before the shortest cut pause is learned. */
const SILENCE_DECISIONS = 6;
/** A hesitation is kept for the course after this many refusals, at this share of decisions. */
const FILLER_REFUSALS = 3;
const FILLER_SHARE = 0.7;
/** A kind of cut is turned off after this many decisions, nearly all refused. */
const KIND_DECISIONS = 10;
const KIND_SHARE = 0.9;
/** The automatic zoom and the cards are turned off after this many decisions, mostly refused. */
const RULE_DECISIONS = 3;
const RULE_SHARE = 0.75;

const round = (v: number): number => Math.round(v * 100) / 100;

/**
 * The shortest pause to cut that best agrees with the decisions: pauses accepted for cutting are
 * at least that long and pauses refused are shorter, with the fewest disagreements; on a tie,
 * the one closest to `current`. Within 0.5 to 5 s.
 */
export function learnedMinSilence(
  decisions: readonly { seconds: number; accepted: boolean; weight?: number }[],
  current: number,
): number {
  const candidates = [
    current,
    ...decisions.map((d) => d.seconds + 0.05),
    ...decisions.map((d) => d.seconds - 0.05),
  ]
    .map((v) => Math.min(5, Math.max(0.5, round(v))))
    .sort((a, b) => a - b);
  let best = current;
  let bestErrors = Number.POSITIVE_INFINITY;
  for (const t of candidates) {
    const errors = decisions
      .filter((d) => d.seconds >= t !== d.accepted)
      .reduce((n, d) => n + (d.weight ?? 1), 0);
    if (
      errors < bestErrors - 1e-9 ||
      (Math.abs(errors - bestErrors) <= 1e-9 && Math.abs(t - current) < Math.abs(best - current))
    ) {
      best = t;
      bestErrors = errors;
    }
  }
  return best;
}

const lessonOf = (e: LearningEvent): string => e.lesson ?? "";

/**
 * How much each lesson's decisions weigh: the lesson decided most recently 1, the one before it
 * LESSON_DECAY, and so on.
 */
export function lessonWeights(events: readonly LearningEvent[]): Map<string, number> {
  const last = new Map<string, number>();
  for (const e of events) last.set(lessonOf(e), Math.max(last.get(lessonOf(e)) ?? 0, e.at));
  const order = [...last.entries()].sort((a, b) => b[1] - a[1]);
  return new Map(order.map(([lesson], i) => [lesson, LESSON_DECAY ** i]));
}

interface Tally {
  /** Decisions, as many as there were. */
  yes: number;
  no: number;
  /** Share of refusals, recent lessons weighing more. */
  refused: number;
  /** Lessons the decisions come from. */
  lessons: number;
}

function tallyOf(events: readonly LearningEvent[], weights: ReadonlyMap<string, number>): Tally {
  let wy = 0;
  let wn = 0;
  for (const e of events) {
    const w = weights.get(lessonOf(e)) ?? 1;
    if (e.accepted) wy += w;
    else wn += w;
  }
  return {
    yes: events.filter((e) => e.accepted).length,
    no: events.filter((e) => !e.accepted).length,
    refused: wy + wn > 0 ? wn / (wy + wn) : 0,
    lessons: new Set(events.map(lessonOf)).size,
  };
}

/**
 * The course template adjusted by what the person decided in earlier lessons, and in words what
 * changed. Without decisions, the template as it is.
 */
export function learnedDefaults(
  learning: Learning | null,
  template: CourseTemplate,
): { template: CourseTemplate; notes: string[] } {
  const events = learning?.events ?? [];
  if (!events.length) return { template, notes: [] };
  const notes: string[] = [];
  const out: CourseTemplate = { ...template };
  const cleanup = { ...template.cleanup };
  const of = (kind: LearningKind): LearningEvent[] => events.filter((e) => e.kind === kind);
  const weights = lessonWeights(events);
  const tally = (list: readonly LearningEvent[]): Tally => tallyOf(list, weights);

  // The shortest pause cut.
  const timed = of("silence").filter((e) => e.seconds !== undefined);
  const pauses = timed.map((e) => ({
    seconds: e.seconds ?? 0,
    accepted: e.accepted,
    weight: weights.get(lessonOf(e)) ?? 1,
  }));
  if (
    pauses.length >= SILENCE_DECISIONS &&
    tally(timed).lessons >= MIN_LESSONS &&
    pauses.some((p) => !p.accepted)
  ) {
    const current = cleanup.minSilence ?? DEFAULT_CLEANUP.minSilence;
    const learned = learnedMinSilence(pauses, current);
    if (Math.abs(learned - current) >= 0.05) {
      cleanup.minSilence = learned;
      notes.push(
        `pausas a partir de ${String(learned).replace(".", ",")} s (eram ${String(current).replace(".", ",")} s)`,
      );
    }
  }

  // Hesitations said on purpose.
  const words = new Map<string, LearningEvent[]>();
  for (const e of of("filler")) {
    if (!e.word) continue;
    const key = strip(e.word);
    if (!key) continue;
    words.set(key, [...(words.get(key) ?? []), e]);
  }
  const keep = new Set(cleanup.notFillers ?? []);
  for (const [word, list] of words) {
    const t = tally(list);
    if (t.lessons < MIN_LESSONS) continue;
    if (t.no >= FILLER_REFUSALS && t.refused >= FILLER_SHARE) keep.add(word);
    else if (t.yes >= FILLER_REFUSALS && 1 - t.refused >= FILLER_SHARE) keep.delete(word);
  }
  const before = new Set(cleanup.notFillers ?? []);
  if (keep.size || before.size) {
    const added = [...keep].filter((w) => !before.has(w));
    if (added.length) notes.push(`não corta mais ${added.map((w) => `"${w}"`).join(", ")}`);
    cleanup.notFillers = [...keep].sort();
    if (!cleanup.notFillers.length) delete cleanup.notFillers;
  }

  // A kind of cut the person nearly always refuses.
  for (const kind of ["filler", "silence", "repeat"] as const) {
    const t = tally(of(kind));
    if (t.yes + t.no >= KIND_DECISIONS && t.lessons >= MIN_LESSONS && t.refused >= KIND_SHARE) {
      if (cleanup.kinds?.[kind] === false) continue;
      cleanup.kinds = { ...cleanup.kinds, [kind]: false };
      notes.push(
        `${kind === "filler" ? "vícios" : kind === "silence" ? "pausas" : "repetições"} ficam fora da limpeza`,
      );
    }
  }
  if (Object.keys(cleanup).length) out.cleanup = cleanup;

  // The automatic zoom on clicks.
  const zoom = tally(of("zoom"));
  if (
    template.zoom?.auto &&
    zoom.yes + zoom.no >= RULE_DECISIONS &&
    zoom.lessons >= MIN_LESSONS &&
    zoom.refused >= RULE_SHARE
  ) {
    out.zoom = { ...template.zoom, auto: false };
    out.rules = (out.rules ?? template.rules ?? []).filter((r) => r.when.event !== "click");
    notes.push("sem zoom automático nos cliques");
  }

  // Opening and closing cards.
  const cards = tally(of("card"));
  if (
    template.cards &&
    (template.cards.opening || template.cards.closing) &&
    cards.yes + cards.no >= 2 &&
    cards.lessons >= MIN_LESSONS &&
    cards.yes === 0
  ) {
    out.cards = { ...template.cards, opening: false, closing: false };
    notes.push("sem cartelas de abertura e encerramento");
  }

  // Annotations of "Na tela" directions: a rule refused every time goes, and fewer per minute.
  const annotations = of("annotation");
  const rules = out.rules ?? template.rules ?? [];
  const dropped = rules.filter((r) => {
    if (!r.when.screenText || !r.do.annotation) return false;
    const mine = annotations.filter((e) => e.direction && ruleMatches(r, e.direction));
    const t = tally(mine);
    return t.no >= 2 && t.yes === 0 && t.lessons >= MIN_LESSONS;
  });
  if (dropped.length) {
    out.rules = rules.filter((r) => !dropped.includes(r));
    notes.push(
      dropped.length === 1
        ? `sem a anotação de "${dropped[0].when.screenText}"`
        : `sem ${dropped.length} regras de anotação recusadas`,
    );
  }
  const all = tally(annotations);
  if (
    template.annotations &&
    all.yes + all.no >= 6 &&
    all.lessons >= MIN_LESSONS &&
    all.refused >= 0.6
  ) {
    const now = template.annotations.maxPerMinute;
    const fewer = now > 0 ? Math.max(1, Math.floor(now / 2)) : 2;
    if (fewer !== now) {
      out.annotations = { ...template.annotations, maxPerMinute: fewer };
      notes.push(`no máximo ${fewer} ${fewer === 1 ? "anotação" : "anotações"} por minuto`);
    }
  }
  return { template: out, notes };
}

/**
 * What a cut proposal resolved in `lesson` says. Applied, each item is a decision. Thrown away
 * whole, it is one decision per kind of cleanup cut it had (not one per item: a whole proposal
 * set aside says little about each pause or word in it), and nothing about the other cuts.
 */
export function proposalLearning(
  items: readonly Pick<ProposalItem, "category" | "status" | "text" | "start" | "end">[],
  applied: boolean,
  keepPause: number,
  now: number,
  lesson?: string,
): LearningEvent[] {
  const where = lesson ? { lesson } : {};
  if (!applied) {
    const kinds = new Set(items.flatMap((i) => (i.category ? [i.category] : [])));
    return (["filler", "silence", "repeat"] as const)
      .filter((k) => kinds.has(k))
      .map((kind) => ({ kind, accepted: false, at: now, ...where }));
  }
  return items.flatMap((i): LearningEvent[] => {
    if (!i.category) return [];
    const base = { kind: i.category, accepted: i.status === "pending", at: now, ...where };
    if (i.category === "filler") {
      const word = strip(i.text ?? "");
      return word ? [{ ...base, word: word.slice(0, 60) }] : [base];
    }
    if (i.category === "silence")
      return [{ ...base, seconds: Math.round((i.end - i.start + keepPause) * 100) / 100 }];
    return [base];
  });
}

/** What a draft resolved says: its automatic zooms, cards and annotations of "Na tela". */
export function draftLearning(
  items: readonly Pick<DiffItem, "kind" | "status" | "patches">[],
  applied: boolean,
  now: number,
  lesson?: string,
): LearningEvent[] {
  return items.flatMap((i): LearningEvent[] => {
    const accepted = applied && i.status === "pending";
    const at = now;
    const made = i.patches.flatMap((p) =>
      p.entity === "clip" && p.after && !p.before ? [p.after] : [],
    );
    const field = (c: Record<string, unknown>, key: string): unknown => {
      const a: unknown = c.annotation;
      return a && typeof a === "object" ? Reflect.get(a, key) : undefined;
    };
    const where = lesson ? { lesson } : {};
    if (made.some((c) => field(c, "kind") === "card"))
      return [{ kind: "card", accepted, at, ...where }];
    const direction = made
      .map((c) => field(c, "direction"))
      .find((d): d is string => typeof d === "string");
    if (direction)
      return [
        {
          kind: "annotation",
          accepted,
          at,
          ...where,
          // The id is "<section>:<item>:<words>": the words are what the rules match.
          direction: direction.split(":").slice(2).join(":").slice(0, 200),
        },
      ];
    if (i.kind === "zoom") return [{ kind: "zoom", accepted, at, ...where }];
    return [];
  });
}
