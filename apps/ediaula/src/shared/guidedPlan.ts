import { z } from "zod";
import type { HoldReason } from "./frameClock.ts";
import {
  GUIDED_DEFAULTS,
  GUIDED_KEYS,
  type GuidedPlan,
  type GuidedTarget,
} from "./guidedRecording.ts";
import {
  type Locator,
  legacyLocator,
  locatorSchema,
  type Point,
  TARGET_STATES,
  type TargetState,
} from "./locators.ts";
import { keyLabel } from "./recording.ts";

/**
 * Guided plan, version 2 (G23, G24): what the guided recording does, saved in the project
 * (`project.guided`) and resumable. A plan runs either in the lesson window, through the page
 * itself (the Chrome DevTools Protocol: no real pointer, fixed resolution, elements found by
 * locators), or on the screen, moving the Windows pointer for targets outside the lesson window.
 * Version 1 plans (only kept by the recorder window, never saved) are read through migratePlan.
 *
 * Times are seconds of the narration: `at` is when the action happens, `speechAt` when its
 * phrase starts. The schedule (schedulePlan) puts the pointer on the target before both, with
 * the plan's tempos, and leaves `after` seconds to watch the result.
 */

export const GUIDED_ACTIONS = [
  "point",
  "hover",
  "click",
  "doubleClick",
  "rightClick",
  "drag",
  "scroll",
  "type",
  "key",
  "wait",
] as const;
export type GuidedAction = (typeof GUIDED_ACTIONS)[number];

export const ACTION_LABELS: Record<GuidedAction, string> = {
  point: "Apontar",
  hover: "Passar o mouse",
  click: "Clicar",
  doubleClick: "Clique duplo",
  rightClick: "Clique direito",
  drag: "Arrastar",
  scroll: "Rolar",
  type: "Clicar e digitar",
  key: "Tecla ou atalho",
  wait: "Esperar",
};

/** The element (lesson window) or the position on the screen (other programs). */
export interface GuidedStepTarget {
  locator?: Locator;
  screen?: GuidedTarget;
}

export interface GuidedCondition {
  locator: Locator;
  state: TargetState;
}

/** Where a drag ends: another target, or a point of the page, of the Blockly workspace or of the screen. */
export interface GuidedDestination {
  target?: GuidedStepTarget;
  point?: { x: number; y: number; space: "page" | "workspace" | "screen" };
}

export interface GuidedStepV2 {
  id: string;
  speech: string;
  /** When the action happens, in narration seconds. */
  at: number;
  /** When its phrase starts; defaults to `at`. */
  speechAt?: number;
  action: GuidedAction;
  target?: GuidedStepTarget;
  /** drag */
  to?: GuidedDestination;
  /** type: the text */
  value?: string;
  /** key: "Enter", "Ctrl+Shift+Z" */
  chord?: string;
  /** scroll: CSS pixels (lesson window) or wheel notches of 120 (screen), down and right positive. */
  delta?: { x: number; y: number };
  /** scroll until it shows; wait until it is in this state. */
  until?: GuidedCondition;
  /** Checked after the action: the step only ends once it holds. */
  expect?: GuidedCondition;
  /** Longest wait for this step's target or conditions, seconds. */
  timeout?: number;
}

export interface GuidedTempos {
  move: number;
  dwell: number;
  after: number;
  anticipation: number;
}

export interface GuidedViewport {
  width: number;
  height: number;
}

export interface GuidedPlanV2 {
  version: 2;
  id: string;
  name: string;
  /** "web": the lesson window, through the page. "screen": the Windows pointer, any program. */
  mode: "web" | "screen";
  /** Page the take starts from (web). */
  url?: string;
  /** Size the lesson page is captured at (web). */
  viewport: GuidedViewport;
  fps?: 30 | 60;
  steps: GuidedStepV2[];
  tempos: GuidedTempos;
  audio?: { path: string; duration: number };
  updatedAt?: number;
}

/** A take of a plan: where it stopped, so it can go on from that step in a new take. */
export interface GuidedRunRecord {
  planId: string;
  /** done: every step; failed and stopped: the step it did not finish. */
  step: number;
  status: "done" | "failed" | "stopped";
  dir: string;
  /** Date.now() of the take. */
  at?: number;
}

/** "Regravar e substituir": the guided take of a media, to be recorded again with its plan. */
export interface GuidedReplace {
  assetId: string;
  assetName: string;
  planId: string;
  /** Timing signature of the plan when the take was made (planTiming). */
  timing: string;
  /** First step that take recorded. */
  from: number;
  /** Seconds of that take. */
  duration: number;
}

/** project.guided */
export interface GuidedStore {
  plans: GuidedPlanV2[];
  runs?: GuidedRunRecord[];
  updatedAt?: number;
}

/** What is being marked in the lesson window: a step's target, where a drag ends, or what to wait for. */
export const MARK_PURPOSES = ["target", "destination", "condition"] as const;
export type GuidedMarkPurpose = (typeof MARK_PURPOSES)[number];

/** An element marked in the lesson window (main/guidedCdp.ts). */
export interface GuidedMark {
  locator?: Locator;
  /** The Blockly workspace's background was marked: this point, in workspace units. */
  workspace?: Point;
  /** Address of the page it was marked on. */
  url: string;
}

export type GuidedTakePhase =
  | "opening"
  | "preparing"
  | "recording"
  | "paused"
  | "holding"
  | "failed"
  | "done"
  | "saving";

/** A guided take in the lesson window, as the recorder shows it five times a second. */
export interface GuidedTakeStatus {
  phase: GuidedTakePhase;
  /** Index in the plan of the step running (or that failed). */
  step: number;
  steps: number;
  /** Seconds of video so far, and planned. */
  time: number;
  duration: number;
  holding?: HoldReason;
  message?: string;
  /** The page as it is recorded, small. */
  preview?: string;
}

/** A step "Verificar plano" could not do, with the page as it was. */
export interface BrokenStep {
  index: number;
  message: string;
  screenshot?: string;
}

export const DEFAULT_VIEWPORT: GuidedViewport = { width: 1920, height: 1080 };
export const VIEWPORTS: readonly GuidedViewport[] = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];
export const DEFAULT_TEMPOS: GuidedTempos = { ...GUIDED_DEFAULTS };
/** Seconds a step waits for its target or a condition before it fails. */
export const DEFAULT_STEP_TIMEOUT = 8;
/** Seconds between two typed characters. */
export const TYPE_INTERVAL = 0.08;
/** Seconds between two wheel steps of a scroll. */
export const WHEEL_INTERVAL = 0.08;
/** CSS pixels of one wheel step in the lesson window. */
export const WHEEL_STEP = 100;
export const MAX_PLANS = 50;
export const MAX_RUNS = 200;

// ---- keys ----------------------------------------------------------------------------------

export interface Chord {
  /** DOM key value ("z", "Z", "Enter"). */
  key: string;
  /** DOM code ("KeyZ"). */
  code: string;
  /** Windows virtual key. */
  vk: number;
  /** What it types (no Ctrl, Alt or Meta held). */
  text?: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  /** Chrome DevTools Protocol modifiers: Alt 1, Ctrl 2, Meta 4, Shift 8. */
  modifiers: number;
  /** As the editor shows keys ("Ctrl+Shift+Z", "→"). */
  label: string;
}

const NAMED: Record<string, { key: string; code: string; vk: number; text?: string }> = {
  enter: { key: "Enter", code: "Enter", vk: 13, text: "\r" },
  tab: { key: "Tab", code: "Tab", vk: 9 },
  space: { key: " ", code: "Space", vk: 32, text: " " },
  escape: { key: "Escape", code: "Escape", vk: 27 },
  esc: { key: "Escape", code: "Escape", vk: 27 },
  backspace: { key: "Backspace", code: "Backspace", vk: 8 },
  delete: { key: "Delete", code: "Delete", vk: 46 },
  del: { key: "Delete", code: "Delete", vk: 46 },
  insert: { key: "Insert", code: "Insert", vk: 45 },
  home: { key: "Home", code: "Home", vk: 36 },
  end: { key: "End", code: "End", vk: 35 },
  pageup: { key: "PageUp", code: "PageUp", vk: 33 },
  pagedown: { key: "PageDown", code: "PageDown", vk: 34 },
  arrowup: { key: "ArrowUp", code: "ArrowUp", vk: 38 },
  up: { key: "ArrowUp", code: "ArrowUp", vk: 38 },
  arrowdown: { key: "ArrowDown", code: "ArrowDown", vk: 40 },
  down: { key: "ArrowDown", code: "ArrowDown", vk: 40 },
  arrowleft: { key: "ArrowLeft", code: "ArrowLeft", vk: 37 },
  left: { key: "ArrowLeft", code: "ArrowLeft", vk: 37 },
  arrowright: { key: "ArrowRight", code: "ArrowRight", vk: 39 },
  right: { key: "ArrowRight", code: "ArrowRight", vk: 39 },
};
const PUNCTUATION: Record<string, { code: string; vk: number }> = {
  "-": { code: "Minus", vk: 189 },
  "=": { code: "Equal", vk: 187 },
  ",": { code: "Comma", vk: 188 },
  ".": { code: "Period", vk: 190 },
  "/": { code: "Slash", vk: 191 },
  ";": { code: "Semicolon", vk: 186 },
  "'": { code: "Quote", vk: 222 },
  "[": { code: "BracketLeft", vk: 219 },
  "]": { code: "BracketRight", vk: 221 },
  "\\": { code: "Backslash", vk: 220 },
  "`": { code: "Backquote", vk: 192 },
};
const MODIFIER_NAMES: Record<string, "ctrl" | "alt" | "shift" | "meta"> = {
  ctrl: "ctrl",
  control: "ctrl",
  ctl: "ctrl",
  alt: "alt",
  option: "alt",
  shift: "shift",
  meta: "meta",
  win: "meta",
  windows: "meta",
  cmd: "meta",
  command: "meta",
  super: "meta",
};

/** "Ctrl+Shift+Z", "Enter", "F5", "Alt+ArrowLeft"; null when it is not a key the page can get. */
export function parseChord(text: string): Chord | null {
  const parts = text
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length || parts.length > 5) return null;
  const mods = { ctrl: false, alt: false, shift: false, meta: false };
  for (const part of parts.slice(0, -1)) {
    const name = MODIFIER_NAMES[part.toLowerCase()];
    if (!name || mods[name]) return null;
    mods[name] = true;
  }
  const last = parts[parts.length - 1];
  const lower = last.toLowerCase();
  let base: { key: string; code: string; vk: number; text?: string } | undefined = NAMED[lower];
  const fn = /^f([1-9]|1\d|2[0-4])$/.exec(lower);
  if (!base && fn) base = { key: `F${fn[1]}`, code: `F${fn[1]}`, vk: 111 + Number(fn[1]) };
  if (!base && /^[a-z]$/i.test(last)) {
    const upper = last.toUpperCase();
    const key = mods.shift ? upper : upper.toLowerCase();
    base = { key, code: `Key${upper}`, vk: upper.charCodeAt(0), text: key };
  }
  if (!base && /^\d$/.test(last))
    base = { key: last, code: `Digit${last}`, vk: last.charCodeAt(0), text: last };
  if (!base && PUNCTUATION[last]) base = { key: last, ...PUNCTUATION[last], text: last };
  if (!base || MODIFIER_NAMES[lower]) return null;
  const typing = !mods.ctrl && !mods.alt && !mods.meta;
  return {
    key: base.key,
    code: base.code,
    vk: base.vk,
    ...(typing && base.text ? { text: base.text } : {}),
    ...mods,
    modifiers:
      (mods.alt ? 1 : 0) | (mods.ctrl ? 2 : 0) | (mods.meta ? 4 : 0) | (mods.shift ? 8 : 0),
    label: keyLabel(
      base.vk,
      [mods.ctrl, mods.alt, mods.shift, mods.meta].map((m) => (m ? "1" : "0")).join(""),
    ),
  };
}

// ---- schema ---------------------------------------------------------------------------------

const coordinate = z.int().min(-1_000_000).max(1_000_000);
const screenTargetSchema = z.object({
  x: coordinate,
  y: coordinate,
  window: z.string().regex(/^\d{1,20}$/),
  title: z.string().max(1000),
  left: coordinate,
  top: coordinate,
  width: coordinate,
  height: coordinate,
  browser: z
    .object({
      selector: z.string().max(4000),
      url: z.string().max(4096),
      kind: z.enum(["element", "canvas", "frame"]),
      u: z.number().min(0).max(1),
      v: z.number().min(0).max(1),
      label: z.string().max(1000),
    })
    .optional(),
}) satisfies z.ZodType<GuidedTarget>;
const targetSchema = z.object({
  locator: locatorSchema.optional(),
  screen: screenTargetSchema.optional(),
});
const conditionSchema = z.object({ locator: locatorSchema, state: z.enum(TARGET_STATES) });
const seconds = z.number().finite().min(0).max(14400);
const stepSchema = z.looseObject({
  id: z.string().min(1).max(200),
  speech: z.string().max(4000),
  at: seconds,
  speechAt: seconds.optional(),
  action: z.enum(GUIDED_ACTIONS),
  target: targetSchema.optional(),
  to: z
    .object({
      target: targetSchema.optional(),
      point: z
        .object({
          x: z.number().finite().min(-1e6).max(1e6),
          y: z.number().finite().min(-1e6).max(1e6),
          space: z.enum(["page", "workspace", "screen"]),
        })
        .optional(),
    })
    .optional(),
  value: z.string().max(1000).optional(),
  chord: z.string().max(60).optional(),
  delta: z
    .object({
      x: z.number().finite().min(-100000).max(100000),
      y: z.number().finite().min(-100000).max(100000),
    })
    .optional(),
  until: conditionSchema.optional(),
  expect: conditionSchema.optional(),
  timeout: z.number().finite().min(0.5).max(120).optional(),
}) satisfies z.ZodType<GuidedStepV2>;

export const guidedPlanV2Schema = z.looseObject({
  version: z.literal(2),
  id: z.string().min(1).max(200),
  name: z.string().max(200),
  mode: z.enum(["web", "screen"]),
  url: z.string().max(4096).optional(),
  viewport: z.object({
    width: z.int().min(320).max(3840),
    height: z.int().min(240).max(2160),
  }),
  fps: z.union([z.literal(30), z.literal(60)]).optional(),
  steps: z.array(stepSchema).max(300),
  tempos: z.object({
    move: z.number().finite(),
    dwell: z.number().finite(),
    after: z.number().finite(),
    anticipation: z.number().finite(),
  }),
  audio: z
    .object({
      path: z
        .string()
        .min(1)
        .max(32768)
        .refine((v) => !v.includes("\0")),
      duration: z.number().finite().positive().max(14400),
    })
    .optional(),
  updatedAt: z.number().nonnegative().optional(),
}) satisfies z.ZodType<GuidedPlanV2>;

/** A version 1 plan is upgraded before it is checked; anything else is checked as it is. */
export const guidedPlanSchema = z.preprocess(
  (raw) => (isLegacyPlan(raw) ? migratePlan(raw) : raw),
  guidedPlanV2Schema,
);

export const guidedRunRecordSchema = z.looseObject({
  planId: z.string().min(1).max(200),
  step: z.int().nonnegative().max(300),
  status: z.enum(["done", "failed", "stopped"]),
  dir: z.string().max(32768),
  at: z.number().nonnegative().optional(),
}) satisfies z.ZodType<GuidedRunRecord>;

export const guidedStoreSchema = z.looseObject({
  plans: z.array(guidedPlanSchema).max(MAX_PLANS),
  runs: z.array(guidedRunRecordSchema).max(MAX_RUNS).optional(),
  updatedAt: z.number().nonnegative().optional(),
}) satisfies z.ZodType<GuidedStore>;

// ---- version 1 ------------------------------------------------------------------------------

function isLegacyPlan(raw: unknown): raw is GuidedPlan {
  if (!raw || typeof raw !== "object") return false;
  const plan = raw as Record<string, unknown>;
  return plan.version === undefined && Array.isArray(plan.steps) && typeof plan.move === "number";
}

/** 32-bit FNV-1a, as eight hex digits. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * A version 1 plan as version 2: it moved the real pointer, so it stays a screen plan; targets
 * marked in the lesson window keep their selector and text as a locator too.
 */
export function migratePlan(
  v1: GuidedPlan,
  id = `plano-${hashText(JSON.stringify(v1.steps.map((s) => [s.id, s.at])))}`,
  name = "Plano guiado",
): GuidedPlanV2 {
  const browser = v1.steps.find((s) => s.target?.browser)?.target?.browser;
  let url: string | undefined;
  try {
    url = browser ? new URL(browser.url).href : undefined;
  } catch {
    url = undefined;
  }
  return {
    version: 2,
    id,
    name,
    mode: "screen",
    ...(url ? { url } : {}),
    viewport: { ...DEFAULT_VIEWPORT },
    steps: v1.steps.map((s) => ({
      id: s.id,
      speech: s.speech,
      at: s.at,
      ...(s.speechAt !== undefined ? { speechAt: s.speechAt } : {}),
      action: s.action,
      ...(s.target
        ? {
            target: {
              screen: s.target,
              ...(s.target.browser ? { locator: legacyLocator(s.target.browser) } : {}),
            },
          }
        : {}),
      ...(s.action === "key" && s.value ? { chord: s.value } : {}),
      ...(s.action === "type" && s.value !== undefined ? { value: s.value } : {}),
    })),
    tempos: {
      move: v1.move,
      dwell: v1.dwell,
      after: v1.after,
      anticipation: v1.anticipation ?? GUIDED_DEFAULTS.anticipation,
    },
    ...(v1.audio ? { audio: v1.audio } : {}),
  };
}

/** Any stored plan as version 2, or null when it is not one. */
export function normalizePlan(raw: unknown): GuidedPlanV2 | null {
  const parsed = guidedPlanSchema.safeParse(raw);
  return parsed.success ? (parsed.data as GuidedPlanV2) : null;
}

export function newPlan(id: string, name: string, mode: "web" | "screen" = "web"): GuidedPlanV2 {
  return {
    version: 2,
    id,
    name,
    mode,
    viewport: { ...DEFAULT_VIEWPORT },
    fps: 30,
    steps: [],
    tempos: { ...DEFAULT_TEMPOS },
  };
}

// ---- schedule -------------------------------------------------------------------------------

/** Actions that start with the pointer on a target. */
export function needsTarget(
  step: Pick<GuidedStepV2, "action" | "target">,
  mode: "web" | "screen",
): boolean {
  if (step.action === "wait") return false;
  if (step.action === "scroll") return !!step.target;
  if (step.action === "key") return mode === "screen" || !!step.target;
  return true;
}

/** Seconds a scroll of `delta` takes: one wheel step every WHEEL_INTERVAL. */
export function wheelSteps(delta: { x: number; y: number }, mode: "web" | "screen"): number {
  const unit = mode === "web" ? WHEEL_STEP : 1;
  return Math.max(1, Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.y)) / unit));
}

/** Seconds the action itself takes after its moment, before the observation time. */
export function actionLength(
  step: GuidedStepV2,
  plan: Pick<GuidedPlanV2, "mode" | "tempos">,
): number {
  if (step.action === "type") return (step.value?.length ?? 0) * TYPE_INTERVAL;
  if (step.action === "drag") return plan.tempos.move;
  if (step.action === "scroll" && step.delta)
    return wheelSteps(step.delta, plan.mode) * WHEEL_INTERVAL;
  return 0;
}

export interface PlannedStep {
  step: GuidedStepV2;
  /** Index in the plan. */
  index: number;
  /** The pointer starts towards the target, arrives, the phrase starts, the action, the end. */
  moveAt: number;
  arriveAt: number;
  speechAt: number;
  actAt: number;
  endAt: number;
  /** The step moves the pointer to a target first. */
  moves: boolean;
}

export interface PlanSchedule {
  /** Seconds of the take before narration second `base`. */
  lead: number;
  /** Narration second at the take's `lead` (0 unless the take starts at a later step). */
  base: number;
  duration: number;
  /** The first step the take records. */
  from: number;
  steps: PlannedStep[];
}

const TEMPO_LIMITS = [
  ["move", 0.5, 5],
  ["dwell", 0.3, 5],
  ["after", 0.5, 15],
] as const;

function checkStep(step: GuidedStepV2, i: number, plan: GuidedPlanV2): void {
  const n = i + 1;
  const web = plan.mode === "web";
  if (!Number.isFinite(step.at) || step.at < 0 || step.at > 14400)
    throw new Error(`Etapa ${n}: tempo inválido.`);
  if (!(GUIDED_ACTIONS as readonly string[]).includes(step.action))
    throw new Error("Ação inválida.");
  const hasTarget = (t: GuidedStepTarget | undefined): boolean =>
    web
      ? !!t?.locator
      : !!t?.screen &&
        Number.isFinite(t.screen.x) &&
        Number.isFinite(t.screen.y) &&
        /^\d+$/.test(t.screen.window);
  if (needsTarget(step, plan.mode) && !hasTarget(step.target))
    throw new Error(`Marque o alvo da etapa ${n}.`);
  if (step.action === "key" && !parseChord(step.chord ?? ""))
    throw new Error(`Etapa ${n}: escolha uma tecla.`);
  if (step.action === "type" && (!step.value || step.value.length > 1000))
    throw new Error(`Etapa ${n}: digite até 1000 caracteres.`);
  if (step.action === "drag") {
    const to = step.to;
    const point = to?.point;
    const ok = web
      ? hasTarget(to?.target) || (!!point && point.space !== "screen")
      : hasTarget(to?.target) || point?.space === "screen";
    if (!ok) throw new Error(`Etapa ${n}: marque onde o arrasto termina.`);
  }
  if (step.action === "scroll") {
    if (!step.delta && !step.until) throw new Error(`Etapa ${n}: diga quanto rolar ou até onde.`);
    if (step.delta && step.delta.x === 0 && step.delta.y === 0)
      throw new Error(`Etapa ${n}: a rolagem precisa de uma distância.`);
  }
  if (step.action === "wait" && !step.until)
    throw new Error(`Etapa ${n}: marque o elemento a esperar.`);
  if (!web && (step.until || step.expect))
    throw new Error(
      `Etapa ${n}: esperar por um elemento só funciona na janela da aula. No modo de tela, use tempos.`,
    );
  if (
    step.timeout !== undefined &&
    (!Number.isFinite(step.timeout) || step.timeout < 0.5 || step.timeout > 120)
  )
    throw new Error(`Etapa ${n}: o tempo máximo de espera deve estar entre 0,5 e 120 segundos.`);
}

/**
 * When everything happens, in seconds of the take. Throws the first problem the teacher has to
 * fix. With `from` the take starts at that step (the steps before it run first, untimed): its
 * phrase becomes the take's narration second 0, after the same lead as a first step.
 */
export function schedulePlan(plan: GuidedPlanV2, from = 0): PlanSchedule {
  if (!plan.steps.length || plan.steps.length > 300)
    throw new Error("Adicione entre 1 e 300 etapas.");
  for (const [key, min, max] of TEMPO_LIMITS) {
    const value = plan.tempos[key];
    if (!Number.isFinite(value) || value < min || value > max)
      throw new Error(`Tempo inválido: ${key}.`);
  }
  const { move, dwell, after, anticipation } = plan.tempos;
  if (!Number.isFinite(anticipation) || anticipation < 0.3 || anticipation > 5)
    throw new Error("Antecipação da fala deve estar entre 0,3 e 5 segundos.");
  if (!Number.isInteger(from) || from < 0 || from >= plan.steps.length)
    throw new Error("Etapa inicial inválida.");
  if (plan.mode === "web") {
    if (!plan.url) throw new Error("Informe o endereço da aula.");
    let url: URL;
    try {
      url = new URL(plan.url);
    } catch {
      throw new Error("Informe um endereço http ou https da plataforma.");
    }
    if (!["http:", "https:"].includes(url.protocol))
      throw new Error("Informe um endereço http ou https da plataforma.");
    const { width, height } = plan.viewport;
    if (width % 2 || height % 2 || width < 320 || height < 240 || width > 3840 || height > 2160)
      throw new Error("Tamanho de captura inválido.");
  }
  for (const [i, step] of plan.steps.entries()) checkStep(step, i, plan);
  const lead = move + Math.max(dwell, anticipation) + 0.5;
  const first = plan.steps[from];
  const base = from === 0 ? 0 : (first.speechAt ?? first.at);
  let previousEnd = 0;
  const steps: PlannedStep[] = [];
  plan.steps.forEach((step, index) => {
    const phrase = step.speechAt ?? step.at;
    if (!Number.isFinite(phrase) || phrase < 0 || phrase > step.at)
      throw new Error(
        `Etapa ${index + 1}: o início da fala deve estar entre zero e o instante da ação.`,
      );
    if (index < from) return;
    const actAt = lead + step.at - base;
    const speechAt = lead + phrase - base;
    const moves = needsTarget(step, plan.mode);
    const arriveAt = moves ? Math.min(actAt - dwell, speechAt - anticipation) : actAt;
    const moveAt = moves ? arriveAt - move : actAt;
    const endAt = actAt + after + actionLength(step, plan);
    if (moveAt < previousEnd - 0.001)
      throw new Error(
        `Etapas muito próximas na etapa ${index + 1}. Aumente o tempo para permitir movimento e pausas.`,
      );
    previousEnd = endAt;
    steps.push({ step, index, moveAt, arriveAt, speechAt, actAt, endAt, moves });
  });
  const audio = plan.audio;
  if (
    audio &&
    (!Number.isFinite(audio.duration) ||
      audio.duration <= 0 ||
      plan.steps.some((s) => s.at >= audio.duration))
  )
    throw new Error("As ações precisam estar dentro da duração do áudio.");
  return {
    lead,
    base,
    from,
    duration: Math.max(previousEnd, audio ? lead + audio.duration - base + after : 0),
    steps,
  };
}

/** The steps a take from `from` replays first, untimed, to bring the page to where it starts. */
export const stepsBefore = (plan: GuidedPlanV2, from: number): GuidedStepV2[] =>
  plan.steps.slice(0, from);

/** Seconds of the take where narration second 0 sits (negative: the take starts inside it). */
export const narrationOffset = (schedule: PlanSchedule): number => schedule.lead - schedule.base;

/**
 * What makes two takes of a plan interchangeable: its tempos and the moment and length of every
 * action. "Regravar e substituir" refuses when this changed.
 */
export function planTiming(plan: GuidedPlanV2): string {
  return hashText(
    JSON.stringify([
      plan.mode,
      plan.tempos.move,
      plan.tempos.dwell,
      plan.tempos.after,
      plan.tempos.anticipation,
      plan.audio?.duration ?? null,
      plan.steps.map((s) => [
        s.at,
        s.speechAt ?? null,
        s.action,
        needsTarget(s, plan.mode),
        actionLength(s, plan),
      ]),
    ]),
  );
}

/** Navigation keys the first guided plans offered, kept first in the list of keys. */
export const COMMON_KEYS: readonly string[] = [
  ...GUIDED_KEYS,
  "Ctrl+Z",
  "Ctrl+Shift+Z",
  "Ctrl+C",
  "Ctrl+V",
];

/** The plans the recorder starts from: the project's, or a newer draft of them (after a crash). */
export function newestGuided(
  project: GuidedStore | undefined,
  draft: GuidedStore | null,
): GuidedStore | undefined {
  if (!draft) return project;
  if (!project) return draft;
  return (draft.updatedAt ?? 0) > (project.updatedAt ?? 0) ? draft : project;
}
