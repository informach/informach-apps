import type { BrokenStep, GuidedPlanV2, PlanSchedule } from "./guidedPlan.ts";

/**
 * "Tela sem voz" of a guided take: what the page took longer than the narration gives (a project
 * being checked on the server, a step that does more than fits before the next line) is recorded
 * as it happened, and kept as a lapse: video seconds `from` to `to` that go in sped up under
 * `narration` seconds of the line (Clip.timelapse, shared/timelapse.ts). The run goes on that
 * much later in the video, so every action after it still falls on its second of the narration.
 *
 * Two clocks of the same take: the video's seconds, and the "aligned" ones, where narration
 * second n is aligned second n + narrationOffset (the video's without the lapses).
 */

export interface GuidedLapse {
  /** Video seconds of the take. */
  from: number;
  to: number;
  /** Seconds of the narration it goes under (less than to - from). */
  narration: number;
  /** Step of the plan whose time it ran past. */
  step?: number;
}

/** The fewest narration seconds a lapse takes: shorter, it would only look like a jump. */
export const LAPSE_FLOOR = 1;

/** A lapse shorter than this is left alone: it is a frame or two of the page's latency. */
export const LAPSE_MIN = 0.05;

const sorted = (lapses: readonly GuidedLapse[]): GuidedLapse[] =>
  [...lapses].filter((l) => l.to > l.from && l.narration > 0).sort((a, b) => a.from - b.from);

/** Aligned second of video second `v`. */
export function alignedAt(lapses: readonly GuidedLapse[], v: number): number {
  let shift = 0;
  for (const l of sorted(lapses)) {
    if (v <= l.from) break;
    const length = l.to - l.from;
    if (v < l.to) return l.from - shift + ((v - l.from) * l.narration) / length;
    shift += length - l.narration;
  }
  return v - shift;
}

/** Video second of aligned second `u` (the inverse of alignedAt). */
export function videoAt(lapses: readonly GuidedLapse[], u: number): number {
  let shift = 0;
  for (const l of sorted(lapses)) {
    const start = l.from - shift;
    if (u <= start) break;
    const length = l.to - l.from;
    if (u < start + l.narration) return l.from + ((u - start) * length) / l.narration;
    shift += length - l.narration;
  }
  return u + shift;
}

/**
 * Video seconds `from` to `to` cut where the lapses begin and end: each stretch with the speed it
 * goes in at (absent: as recorded).
 */
export function lapseSpans(
  lapses: readonly GuidedLapse[],
  from: number,
  to: number,
): { from: number; to: number; speed?: number }[] {
  const spans: { from: number; to: number; speed?: number }[] = [];
  let at = from;
  for (const l of sorted(lapses)) {
    if (l.to <= at) continue;
    if (l.from >= to) break;
    if (l.from > at) spans.push({ from: at, to: l.from });
    const end = Math.min(to, l.to);
    spans.push({ from: Math.max(at, l.from), to: end, speed: (l.to - l.from) / l.narration });
    at = end;
  }
  if (to > at) spans.push({ from: at, to });
  return spans;
}

/** Two takes lapse at the same moments (within a tenth of a second). */
export const sameLapses = (
  a: readonly GuidedLapse[] | undefined,
  b: readonly GuidedLapse[] | undefined,
): boolean => {
  const x = sorted(a ?? []);
  const y = sorted(b ?? []);
  return (
    x.length === y.length &&
    x.every(
      (l, i) =>
        Math.abs(l.from - y[i].from) < 0.1 &&
        Math.abs(l.to - y[i].to) < 0.1 &&
        Math.abs(l.narration - y[i].narration) < 0.1,
    )
  );
};

/** A page this much slower than the narration's room is worth telling (seconds). */
export const VERIFY_SLACK = 0.3;

const seconds = (v: number): string =>
  v.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 0 });

/**
 * What the take will do that is not a problem but changes the video: steps closer than their
 * actions last, and conditions the page took longer to meet than the narration gives, go in sped
 * up under the line ("Tela sem voz"), or are cut when the step says so.
 */
export function takeNotices(
  plan: GuidedPlanV2,
  schedule: PlanSchedule,
  waits: ReadonlyMap<number, { seconds: number; room: number }>,
): BrokenStep[] {
  const notices: BrokenStep[] = [];
  for (const [i, s] of schedule.steps.entries()) {
    const before = schedule.steps[i - 1];
    if (before && s.overlap && s.overlap > VERIFY_SLACK)
      notices.push({
        index: before.index,
        notice: true,
        message: `A etapa ${s.index + 1} começa ${seconds(s.overlap)} s antes de esta terminar: o que não couber na fala entra acelerado (tela sem voz).`,
      });
    const wait = waits.get(s.index);
    if (!wait) continue;
    const cut = plan.steps[s.index]?.wait?.policy === "cut";
    notices.push({
      index: s.index,
      notice: true,
      message: `A página levou ${seconds(wait.seconds)} s para responder e a fala dá ${seconds(wait.room)} s: ${cut ? "a espera é cortada do vídeo" : "o resto entra acelerado (tela sem voz)"}.`,
    });
  }
  return notices;
}
