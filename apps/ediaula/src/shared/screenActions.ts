import type { TimelineWord } from "./cleanup.ts";
import {
  DEFAULT_HOLD,
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
/** " por 2 s", " por 1,5 segundo": how long a "segurar" holds, at the end of its bracket. */
const FOR = String.raw`(?:\s+por\s+(\d+(?:[.,]\d+)?)\s*(?:s|seg|segundos?))?`;
const seconds = (text: string | undefined): number | undefined =>
  text ? Number(text.replace(",", ".")) : undefined;

/**
 * Seconds a bracket holds a button or a key ("segurar seta da direita por 2 s"), the app's verb
 * or the platform's: the gesture after it in the same phrase waits for it to let go. 0 when the
 * bracket holds nothing.
 */
export function heldFor(bracket: string): number {
  const text = bracket.replace(/\s+/g, " ").trim();
  if (!/^segurar\b/i.test(text)) return 0;
  return seconds(new RegExp(`${FOR}$`, "iu").exec(text)?.[1]) ?? DEFAULT_HOLD;
}
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
    re(String.raw`segurar tecla\s+(.+?)${FOR}`),
    (m) => {
      const hold = seconds(m[2]);
      return parseChord(m[1])
        ? { action: "hold", chord: m[1].trim(), ...(hold ? { hold } : {}) }
        : null;
    },
  ],
  [
    re(`segurar${ON}\\s*${Q}${FOR}`),
    (m, at) => {
      const hold = seconds(m[2]);
      return { action: "hold", target: at(m[1]), ...(hold ? { hold } : {}) };
    },
  ],
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
 * The plan the script's brackets make with this voice: the hand leaves for the first bracket of a
 * phrase when the phrase starts and acts when the voice finishes the words quoted (a plain
 * direction: when its line starts), the ones after it in the same piece `followGap` later each.
 * Counted: the brackets left out, whose phrase (or line) the voice does not say, and those that
 * would fall after the voice ends (`afterVoice`), placed at its end to go in sped up.
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
  /** Quotes the voice was not found saying: their gestures follow the one before. */
  missed: string[];
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
  const missed: string[] = [];
  // When the last gesture placed acts: one whose quote was not found comes after it, never before.
  let last = Number.NEGATIVE_INFINITY;
  for (const [index, item] of items.entries()) {
    if (item.kind !== "screen") continue;
    const pieces = item.cues?.length ? item.cues.map((c) => c.text) : [item.text];
    for (const [k, piece] of pieces.entries()) {
      const actions = screenActions(piece);
      const time = times.find((t) => t.item === index && (t.cue ?? 0) === k);
      if (time?.said === undefined || time.said >= duration) {
        unsaid += actions.length;
        continue;
      }
      // The hand leaves when the phrase starts; the first action waits for the voice to finish
      // the words quoted ("Agora clique em Próxima parte": the click after "parte").
      let phrase = time.said;
      let at = Math.max(phrase, time.saidEnd ?? phrase);
      // A piece without a time of its own (its quote not found in the voice, or none after
      // another piece) follows the gesture before it.
      if (time.missed !== undefined || (k > 0 && time.saidEnd === undefined)) {
        if (time.missed !== undefined) missed.push(time.missed);
        at = Math.max(at, last + followGap(tempos));
        phrase = at;
      }
      let first = true;
      for (const [j, text] of actions.entries()) {
        // Every gesture of the script is shown: one that would come after the voice ends goes
        // right at its end, and what does not fit there goes in sped up ("Tela sem voz").
        const latest = Math.max(phrase, duration - 0.01 * (actions.length - j));
        if (at > latest) {
          at = latest;
          afterVoice++;
        }
        const hundredth = Math.round(at * 100) / 100;
        // The robot stays still there; the edit gets a note, where the phrase starts.
        const note = editNoteOf(text);
        if (note) {
          notes.push({ at: Math.round(phrase * 100) / 100, text: note });
          continue;
        }
        const step = actionStep(text, `roteiro-${index + 1}-${k + 1}-${j + 1}`, viewport);
        // The ones after the first of a phrase: the hand leaves when the one before has acted.
        const speechAt = Math.round((first ? phrase : Math.min(last, at)) * 100) / 100;
        first = false;
        steps.push({ ...step, at: hundredth, speechAt });
        last = hundredth;
        // The next one when the hand can be there (a step with nothing to reach comes sooner),
        // after what this one holds has been let go.
        at +=
          (needsTarget(step, "web") || step.action === "platform" ? followGap(tempos) : 1) +
          heldFor(text);
      }
    }
  }
  // The script's order stands: gestures that do not fit before the next phrase run after it and go
  // in sped up ("Tela sem voz"), never mixed with the next phrase's.
  return { steps, notes, unsaid, afterVoice, missed };
}
