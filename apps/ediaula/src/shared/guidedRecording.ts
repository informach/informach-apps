import type { Word } from "./types.ts";

export interface BrowserTarget {
  selector: string;
  url: string;
  kind: "element" | "canvas" | "frame";
  u: number;
  v: number;
  label: string;
}
export interface GuidedTarget {
  x: number;
  y: number;
  window: string;
  title: string;
  left: number;
  top: number;
  width: number;
  height: number;
  browser?: BrowserTarget;
}
export interface GuidedStep {
  id: string;
  speech: string;
  /** Time in the narration, before the recording's initial preparation time. */
  at: number;
  /** Start of the associated phrase, in narration seconds; defaults to the action cue. */
  speechAt?: number;
  action: "point" | "click" | "rightClick" | "type" | "key";
  target?: GuidedTarget;
  value?: string;
}
export interface GuidedPlan {
  steps: GuidedStep[];
  move: number;
  dwell: number;
  after: number;
  /** How long the pointer should already be at the target before the phrase starts. */
  anticipation?: number;
  audio?: { path: string; duration: number };
}
export const GUIDED_DEFAULTS = { move: 1.2, dwell: 0.8, after: 1.5, anticipation: 0.5 };
export const GUIDED_KEYS = [
  "Enter",
  "Tab",
  "Space",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
] as const;
export interface ScheduledStep {
  step: GuidedStep;
  moveAt: number;
  arriveAt: number;
  speechAt: number;
  actAt: number;
  endAt: number;
}
export function scheduleGuided(plan: GuidedPlan): {
  lead: number;
  duration: number;
  steps: ScheduledStep[];
} {
  if (!plan.steps.length || plan.steps.length > 300)
    throw new Error("Adicione entre 1 e 300 etapas.");
  for (const [key, min, max] of [
    ["move", 0.5, 5],
    ["dwell", 0.3, 5],
    ["after", 0.5, 15],
  ] as const) {
    if (!Number.isFinite(plan[key]) || plan[key] < min || plan[key] > max)
      throw new Error(`Tempo inválido: ${key}.`);
  }
  const anticipation = plan.anticipation ?? GUIDED_DEFAULTS.anticipation;
  if (!Number.isFinite(anticipation) || anticipation < 0.3 || anticipation > 5)
    throw new Error("Antecipação da fala deve estar entre 0,3 e 5 segundos.");
  const lead = plan.move + Math.max(plan.dwell, anticipation) + 0.5;
  let previousEnd = 0;
  const steps = plan.steps.map((step, i) => {
    if (!Number.isFinite(step.at) || step.at < 0 || step.at > 14400)
      throw new Error(`Etapa ${i + 1}: tempo inválido.`);
    if (!["point", "click", "rightClick", "type", "key"].includes(step.action))
      throw new Error("Ação inválida.");
    if (
      !step.target ||
      !Number.isFinite(step.target.x) ||
      !Number.isFinite(step.target.y) ||
      !/^\d+$/.test(step.target.window)
    )
      throw new Error(`Marque o alvo da etapa ${i + 1}.`);
    if (step.action === "key" && !GUIDED_KEYS.includes(step.value as (typeof GUIDED_KEYS)[number]))
      throw new Error(`Etapa ${i + 1}: escolha uma tecla.`);
    if (step.action === "type" && (!step.value || step.value.length > 1000))
      throw new Error(`Etapa ${i + 1}: digite até 1000 caracteres.`);
    const actAt = lead + step.at;
    const phrase = step.speechAt ?? step.at;
    if (!Number.isFinite(phrase) || phrase < 0 || phrase > step.at)
      throw new Error(
        `Etapa ${i + 1}: o início da fala deve estar entre zero e o instante da ação.`,
      );
    const speechAt = lead + phrase;
    const arriveAt = Math.min(actAt - plan.dwell, speechAt - anticipation);
    const moveAt = arriveAt - plan.move;
    const endAt =
      actAt + plan.after + (step.action === "type" ? (step.value?.length ?? 0) * 0.08 : 0);
    if (moveAt < previousEnd - 0.001)
      throw new Error(
        `Etapas muito próximas na etapa ${i + 1}. Aumente o tempo para permitir movimento e pausas.`,
      );
    previousEnd = endAt;
    return { step, moveAt, arriveAt, speechAt, actAt, endAt };
  });
  if (
    plan.audio &&
    (!Number.isFinite(plan.audio.duration) ||
      plan.audio.duration <= 0 ||
      plan.steps.some((s) => s.at >= plan.audio!.duration))
  )
    throw new Error("As ações precisam estar dentro da duração do áudio.");
  return {
    lead,
    duration: Math.max(previousEnd, plan.audio ? lead + plan.audio.duration + plan.after : 0),
    steps,
  };
}

export function stepsFromScript(text: string): GuidedStep[] {
  let at = 0;
  return text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 300)
    .map((speech, i) => {
      const click =
        /\bcliqu[eé]|\bclicar/i.test(speech) &&
        !/(não|nunca|evite|sem)\s+(?:\S+\s+)?cl[ia]/i.test(speech);
      const step: GuidedStep = {
        id: `script-${i}`,
        speech,
        at,
        speechAt: at,
        action: click ? "click" : "point",
      };
      at += Math.max(5, speech.split(/\s+/).length / 2.2 + 2);
      return step;
    });
}

/** Only explicit click cues become proposed actions. The user must map and review their targets. */
export function stepsFromWords(words: Word[]): GuidedStep[] {
  return words.flatMap((w, i) => {
    if (
      !/^(clique|clicar|clicamos)[,.!?]?$/i.test(w.text.trim()) ||
      words
        .slice(Math.max(0, i - 2), i)
        .some((x) => /^(não|nunca|evite|sem)[,.!?]?$/i.test(x.text.trim()))
    )
      return [];
    let start = i;
    while (
      start > 0 &&
      i - start < 12 &&
      w.start - words[start - 1].start <= 6 &&
      !/[.!?]$/.test(words[start - 1].text.trim()) &&
      words[start].start - words[start - 1].end < 0.6
    )
      start--;
    return [
      {
        id: `audio-${i}`,
        at: w.start,
        speechAt: words[start].start,
        speech: words
          .slice(start, i + 10)
          .map((x) => x.text)
          .join(" "),
        action: "click" as const,
      },
    ];
  });
}

export const smoothPointer = (t: number): number => {
  const p = Math.max(0, Math.min(1, t));
  return p * p * (3 - 2 * p);
};
