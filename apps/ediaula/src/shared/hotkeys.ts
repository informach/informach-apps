import { KEY_MODIFIERS } from "./helperProtocol.ts";

/**
 * Global shortcuts of the recorder, in Electron's accelerator syntax. Starting, stopping and the
 * guided target stay registered while the recorder is open; the others only during the take, so
 * Ctrl+R and the arrows keep working in other programs the rest of the time. The cursor helper
 * leaves every one of them out of the keys shown on screen.
 */

export const HOTKEY_ACTIONS = [
  "toggle",
  "stop",
  "guidedTarget",
  "marker",
  "note",
  "retake",
  "lineNext",
  "linePrev",
  "draw",
  "timelapse",
  "clickerNext",
  "clickerPrev",
] as const;
export type HotkeyAction = (typeof HOTKEY_ACTIONS)[number];
export type HotkeyMap = Record<HotkeyAction, string>;

export const DEFAULT_HOTKEYS: HotkeyMap = {
  toggle: "F9",
  stop: "F10",
  guidedTarget: "F8",
  marker: "CommandOrControl+Shift+M",
  // Not Ctrl+Shift+N: a new folder in Explorer and a private window in the browser are shown
  // in lessons.
  note: "CommandOrControl+Shift+Y",
  retake: "CommandOrControl+Shift+R",
  lineNext: "CommandOrControl+Shift+Down",
  linePrev: "CommandOrControl+Shift+Up",
  draw: "CommandOrControl+Shift+D",
  // "Tela sobre a narração": hold the voice while the screen goes on (a long construction).
  timelapse: "F7",
  // A presentation clicker sends Page Down and Page Up; only when the teacher turns it on.
  clickerNext: "PageDown",
  clickerPrev: "PageUp",
};

export const HOTKEY_LABELS: Record<HotkeyAction, string> = {
  toggle: "Iniciar e pausar",
  stop: "Parar",
  guidedTarget: "Alvo do modo guiado",
  marker: "Marcador",
  note: "Lembrete da gravação",
  retake: "Refazer o último trecho",
  lineNext: "Próxima fala",
  linePrev: "Fala anterior",
  draw: "Desenhar na tela",
  timelapse: "Segurar e soltar a voz (sobre a narração)",
  clickerNext: "Passador: próxima fala",
  clickerPrev: "Passador: fala anterior",
};

/** Registered while the recorder window is open. */
export const OPEN_HOTKEYS: readonly HotkeyAction[] = ["toggle", "stop", "guidedTarget"];
/** Without these two the take could not be paused or stopped from the keyboard. */
export const REQUIRED_HOTKEYS: readonly HotkeyAction[] = ["toggle", "stop"];
const CLICKER: readonly HotkeyAction[] = ["clickerNext", "clickerPrev"];

/** Shortcuts registered only while a take is running. */
export function sessionHotkeys(clicker: boolean, screen = true, over = false): HotkeyAction[] {
  return [
    "marker",
    "note",
    "retake",
    "lineNext",
    "linePrev",
    // Drawing goes over a screen: a voice take leaves the shortcut to the other programs.
    ...(screen ? (["draw"] as const) : []),
    // Only over the narration: F7 is left to the other programs in any other take.
    ...(over ? (["timelapse"] as const) : []),
    ...(clicker ? CLICKER : []),
  ];
}

/** Every shortcut in use with these settings. */
export const activeHotkeys = (clicker: boolean): HotkeyAction[] => [
  ...OPEN_HOTKEYS,
  ...sessionHotkeys(clicker, true, true),
];

const MODIFIERS: Record<string, number> = {
  commandorcontrol: KEY_MODIFIERS.ctrl,
  cmdorctrl: KEY_MODIFIERS.ctrl,
  control: KEY_MODIFIERS.ctrl,
  ctrl: KEY_MODIFIERS.ctrl,
  alt: KEY_MODIFIERS.alt,
  option: KEY_MODIFIERS.alt,
  shift: KEY_MODIFIERS.shift,
  super: KEY_MODIFIERS.win,
  meta: KEY_MODIFIERS.win,
};

const NAMED: Record<string, [number, string]> = {
  up: [0x26, "↑"],
  down: [0x28, "↓"],
  left: [0x25, "←"],
  right: [0x27, "→"],
  pageup: [0x21, "PgUp"],
  pagedown: [0x22, "PgDn"],
  home: [0x24, "Home"],
  end: [0x23, "End"],
  insert: [0x2d, "Insert"],
  delete: [0x2e, "Del"],
  space: [0x20, "Espaço"],
  tab: [0x09, "Tab"],
  backspace: [0x08, "⌫"],
  enter: [0x0d, "Enter"],
  return: [0x0d, "Enter"],
  escape: [0x1b, "Esc"],
  esc: [0x1b, "Esc"],
};

export interface ParsedHotkey {
  /** Windows virtual key. */
  vk: number;
  /** The helper's modifier flags (1 Ctrl, 2 Alt, 4 Shift, 8 Win). */
  mods: number;
  /** "Ctrl+Shift+M", as shown to the teacher. */
  label: string;
}

/**
 * The key and modifiers of an accelerator; null when it is not one the recorder accepts:
 * exactly one key (letters, digits, F1 to F24, arrows and the navigation block), and a plain
 * letter or digit needs Ctrl, Alt or Win so typing is not taken over.
 */
export function parseAccelerator(text: string): ParsedHotkey | null {
  const parts = text
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length || parts.length > 5) return null;
  let mods = 0;
  let key: [number, string] | null = null;
  for (const part of parts) {
    const lower = part.toLowerCase();
    const modifier = MODIFIERS[lower];
    if (modifier !== undefined) {
      if (mods & modifier) return null;
      mods |= modifier;
      continue;
    }
    if (key) return null;
    if (/^[a-z]$/i.test(part)) key = [part.toUpperCase().charCodeAt(0), part.toUpperCase()];
    else if (/^[0-9]$/.test(part)) key = [part.charCodeAt(0), part];
    else if (/^f([1-9]|1\d|2[0-4])$/i.test(part)) {
      const n = Number(part.slice(1));
      key = [0x6f + n, `F${n}`];
    } else if (NAMED[lower]) key = NAMED[lower];
    else return null;
  }
  if (!key) return null;
  const typing = key[0] >= 0x30 && key[0] <= 0x5a;
  if (typing && !(mods & (KEY_MODIFIERS.ctrl | KEY_MODIFIERS.alt | KEY_MODIFIERS.win))) return null;
  const label = [
    mods & KEY_MODIFIERS.win && "Win",
    mods & KEY_MODIFIERS.ctrl && "Ctrl",
    mods & KEY_MODIFIERS.alt && "Alt",
    mods & KEY_MODIFIERS.shift && "Shift",
    key[1],
  ]
    .filter(Boolean)
    .join("+");
  return { vk: key[0], mods, label };
}

/** "Ctrl+Shift+M" for an accelerator, or the text itself when it does not parse. */
export const hotkeyLabel = (accelerator: string): string =>
  parseAccelerator(accelerator)?.label ?? accelerator;

export interface HotkeyProblem {
  action: HotkeyAction;
  accelerator: string;
  /** "invalid": not an accepted key; "duplicate": the same key as `other`. */
  problem: "invalid" | "duplicate";
  other?: HotkeyAction;
}

/** Shortcuts in use that do not parse or that repeat another one. */
export function hotkeyConflicts(map: HotkeyMap, clicker: boolean): HotkeyProblem[] {
  const problems: HotkeyProblem[] = [];
  const seen = new Map<string, HotkeyAction>();
  for (const action of activeHotkeys(clicker)) {
    const accelerator = map[action];
    const parsed = parseAccelerator(accelerator);
    if (!parsed) {
      problems.push({ action, accelerator, problem: "invalid" });
      continue;
    }
    const key = `${parsed.vk}:${parsed.mods}`;
    const other = seen.get(key);
    if (other) problems.push({ action, accelerator, problem: "duplicate", other });
    else seen.set(key, action);
  }
  return problems;
}

/** The helper's key filter: none of the recorder's shortcuts shows on screen. */
export function toKeyFilter(map: HotkeyMap, clicker: boolean): { vk: number; m: number }[] {
  const out: { vk: number; m: number }[] = [];
  for (const action of activeHotkeys(clicker)) {
    const parsed = parseAccelerator(map[action]);
    if (parsed && !out.some((k) => k.vk === parsed.vk && k.m === parsed.mods))
      out.push({ vk: parsed.vk, m: parsed.mods });
  }
  return out;
}

const CODE_NAMES: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Home: "Home",
  End: "End",
  Insert: "Insert",
  Delete: "Delete",
  Space: "Space",
  Tab: "Tab",
  Enter: "Enter",
  Escape: "Escape",
  Backspace: "Backspace",
};

/**
 * The accelerator for a key pressed in the page (KeyboardEvent.code and its modifiers), by the
 * key's place on the keyboard so Shift+1 is "Shift+1" whatever the layout prints; null for a
 * modifier alone or a key the recorder does not take.
 */
export function acceleratorFromKey(
  code: string,
  mods: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean },
): string | null {
  const key =
    /^Key([A-Z])$/.exec(code)?.[1] ??
    /^Digit(\d)$/.exec(code)?.[1] ??
    (/^F([1-9]|1\d|2[0-4])$/.test(code) ? code : undefined) ??
    CODE_NAMES[code];
  if (!key) return null;
  const accelerator = [
    mods.ctrl && "CommandOrControl",
    mods.alt && "Alt",
    mods.shift && "Shift",
    mods.meta && "Super",
    key,
  ]
    .filter(Boolean)
    .join("+");
  return parseAccelerator(accelerator) ? accelerator : null;
}

/** Whether each shortcut could be registered, shown in the recorder. */
export interface HotkeyReport {
  action: HotkeyAction;
  accelerator: string;
  ok: boolean;
  /** Why not: another program has it, or the key is not valid. */
  reason?: string;
}
