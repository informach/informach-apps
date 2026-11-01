import type { TimelineWord } from "./cleanup.ts";
import {
  type GuidedStepV2,
  type GuidedTempos,
  type GuidedViewport,
  needsTarget,
  parseChord,
} from "./guidedPlan.ts";
import { locatorOf } from "./platformBridge.ts";
import { screenCueTimes } from "./screenCues.ts";
import { type ScriptSection, screenCues } from "./script.ts";
import { alignSection } from "./scriptAlign.ts";

/**
 * The guided plan written in the script: in a "Na tela", what the robot does goes between
 * brackets, next to the spoken phrase it waits for:
 *
 *   No "Olha aqui", [ampliar jogo] e [achar arbusto].
 *
 * Each bracket is a step, on the moment the voice says that phrase (the alignment the recorder
 * already uses, shared/screenCues.ts); a second bracket of the same phrase follows the first by
 * the time the hand needs. The app knows a few verbs of its own, for any page; every other one
 * is asked of the platform, through its recording bridge (shared/platformBridge.ts).
 */

/** "[na edição: …]": a stretch the edit replaces, not an action. */
const EDIT_NOTE = /^na edi[cç][aã]o\s*:\s*(.+)$/iu;

/** The text of an edit note, or null when the bracket is an action. */
export const editNoteOf = (bracket: string): string | null =>
  EDIT_NOTE.exec(bracket)?.[1]?.trim() || null;

/**
 * Where each edit note goes on the timeline: the take starts at timeline second `at`, and
 * narration second n is the take's aligned second n + narrationOffset (the lapses go in sped up,
 * so the timeline follows the narration). Notes outside the take are left out.
 */
export function editMarks(
  notes: readonly { at: number; text: string }[],
  take: { at: number; narrationOffset: number; duration: number },
): { t: number; text: string }[] {
  return notes.flatMap((note) => {
    const aligned = note.at + take.narrationOffset;
    return aligned >= 0 && aligned <= take.duration
      ? [{ t: Math.round((take.at + aligned) * 1000) / 1000, text: `Na edição: ${note.text}` }]
      : [];
  });
}

/** The texts between brackets of a direction, in order. */
export function screenActions(text: string): string[] {
  return [...text.matchAll(/\[([^\]\n]{1,500})\]/g)]
    .map((m) => m[1].replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const Q = String.raw`["“]([^"”]+)["”]`;
const ON = String.raw`(?:\s+(?:em|no|na|nos|nas|sobre|para|o|a))?`;
const re = (pattern: string): RegExp => new RegExp(`^${pattern}$`, "iu");

/** The app's own verbs: the step each one is, on any page. */
const VERBS: [
  RegExp,
  (
    m: RegExpExecArray,
    at: (text: string) => GuidedStepV2["target"],
  ) => Partial<GuidedStepV2> | null,
][] = [
  [re(`clicar${ON}\\s*${Q}`), (m, at) => ({ action: "click", target: at(m[1]) })],
  [
    re(`(?:clique duplo|clicar duas vezes)${ON}\\s*${Q}`),
    (m, at) => ({ action: "doubleClick", target: at(m[1]) }),
  ],
  [re(`clique direito${ON}\\s*${Q}`), (m, at) => ({ action: "rightClick", target: at(m[1]) })],
  [re(`apontar${ON}\\s*${Q}`), (m, at) => ({ action: "point", target: at(m[1]) })],
  [re(`passar o mouse${ON}\\s*${Q}`), (m, at) => ({ action: "hover", target: at(m[1]) })],
  [
    re(`rolar até\\s*${Q}`),
    (m, at) => {
      const target = at(m[1]);
      return target?.locator
        ? {
            action: "scroll",
            delta: { x: 0, y: 400 },
            until: { locator: target.locator, state: "visible" },
          }
        : null;
    },
  ],
  [
    re(String.raw`rolar para (baixo|cima)(?:\s+(\d{1,5}))?`),
    (m) => ({
      action: "scroll",
      delta: { x: 0, y: (m[1].toLowerCase() === "cima" ? -1 : 1) * Number(m[2] ?? 400) },
    }),
  ],
  [
    re(`esperar\\s*${Q}(?:\\s+(sumir|aparecer))?`),
    (m, at) => {
      const target = at(m[1]);
      return target?.locator
        ? {
            action: "wait",
            until: {
              locator: target.locator,
              state: m[2]?.toLowerCase() === "sumir" ? "hidden" : "visible",
            },
          }
        : null;
    },
  ],
  [
    re(`digitar\\s*${Q}\\s+(?:em|no|na)\\s*${Q}`),
    (m, at) => ({ action: "type", value: m[1], target: at(m[2]) }),
  ],
  [
    re(String.raw`tecla\s+(.+)`),
    (m) => (parseChord(m[1]) ? { action: "key", chord: parseChord(m[1])?.label ?? m[1] } : null),
  ],
  [
    re(`arrastar\\s*${Q}\\s+(?:para|até)\\s*${Q}`),
    (m, at) => ({ action: "drag", target: at(m[1]), to: { target: at(m[2]) } }),
  ],
];

/**
 * The step a bracket is: one of the app's verbs, or the platform's action. Without times (`at`
 * and `speechAt` are filled by planFromScript).
 */
export function actionStep(text: string, id: string, viewport: GuidedViewport): GuidedStepV2 {
  const at = (label: string) => ({ locator: locatorOf({ rotulo: label, texto: label }, viewport) });
  const base = { id, speech: text, at: 0 };
  for (const [pattern, make] of VERBS) {
    const m = pattern.exec(text);
    const step = m ? make(m, at) : null;
    if (step) return { ...base, action: "click", ...step };
  }
  return { ...base, action: "platform", platform: text };
}

/** What the recorder has of the script's part: its lines and its "Na tela", in order. */
export interface ScriptPart {
  lines: readonly string[];
  /** Each direction before the line `before` (lines.length: after the last). */
  notes: readonly { before: number; text: string }[];
}

/** Seconds between two brackets of the same phrase: the hand travels and hovers first. */
export const followGap = (tempos: GuidedTempos): number =>
  tempos.move + Math.max(tempos.dwell, tempos.anticipation) + 0.3;

/**
 * The plan the script's brackets make with this voice: every bracket a step on the second its
 * phrase is said (a plain direction: when its line starts), the ones after it in the same piece
 * `followGap` later each. Brackets left out are counted: those whose phrase (or line) the voice
 * does not say, and those that would fall after the voice ends.
 */
export function planFromScript(
  part: ScriptPart,
  words: readonly Pick<TimelineWord, "text" | "start" | "end">[],
  viewport: GuidedViewport,
  tempos: GuidedTempos,
  duration: number,
): {
  steps: GuidedStepV2[];
  notes: { at: number; text: string }[];
  unsaid: number;
  afterVoice: number;
} {
  const items: ScriptSection["items"] = [];
  const spoken = part.lines.join(" ");
  for (let i = 0; i <= part.lines.length; i++) {
    for (const note of part.notes.filter((n) => n.before === i)) {
      const cues = screenCues(note.text, spoken);
      items.push({ kind: "screen", text: note.text, ...(cues ? { cues } : {}) });
    }
    if (i < part.lines.length)
      items.push({ kind: "speech", speaker: "Professora", avatar: false, text: part.lines[i] });
  }
  const section: ScriptSection = { number: "1", title: "", items };
  const timeline: TimelineWord[] = words.map((w, i) => ({
    key: `w${i}`,
    clipId: "voz",
    text: w.text,
    start: w.start,
    end: w.end,
    p: 1,
  }));
  const times = screenCueTimes(section, alignSection(section, timeline).lines, timeline);
  const steps: GuidedStepV2[] = [];
  const notes: { at: number; text: string }[] = [];
  let unsaid = 0;
  let afterVoice = 0;
  for (const [index, item] of items.entries()) {
    if (item.kind !== "screen") continue;
    const pieces = item.cues?.length ? item.cues.map((c) => c.text) : [item.text];
    for (const [k, piece] of pieces.entries()) {
      const actions = screenActions(piece);
      const time = times.find((t) => t.item === index && (t.cue ?? 0) === k);
      if (time?.said === undefined) {
        unsaid += actions.length;
        continue;
      }
      let at = time.said;
      for (const [j, text] of actions.entries()) {
        if (at >= duration) {
          afterVoice += actions.length - j;
          break;
        }
        const hundredth = Math.round(at * 100) / 100;
        // The robot stays still there; the edit gets a note.
        const note = editNoteOf(text);
        if (note) {
          notes.push({ at: hundredth, text: note });
          continue;
        }
        const step = actionStep(text, `roteiro-${index + 1}-${k + 1}-${j + 1}`, viewport);
        steps.push({ ...step, at: hundredth, speechAt: hundredth });
        // The next one when the hand can be there (a step with nothing to reach comes sooner).
        at += needsTarget(step, "web") || step.action === "platform" ? followGap(tempos) : 1;
      }
    }
  }
  steps.sort((a, b) => a.at - b.at);
  return { steps, notes, unsaid, afterVoice };
}
