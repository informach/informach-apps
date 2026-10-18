import { z } from "zod";

/**
 * Lines of the native helper (resources/native/ediaula-helper.exe, sources in native/helper).
 * Every line is one JSON object. Times `t` are milliseconds of the QueryPerformanceCounter clock,
 * the same clock as Node's process.hrtime; positions are physical pixels of the virtual desktop.
 */

const time = z.number().nonnegative();
const coordinate = z.int().min(-1_000_000).max(1_000_000);
const size = z.int().min(0).max(1_000_000);
const rect = z.strictObject({ x: coordinate, y: coordinate, w: size, h: size });
const hwnd = z.string().regex(/^\d{1,20}$/);
const button = z.enum(["left", "right", "middle", "x1", "x2"]);
/** Pointer events from the watchdog's polling while the hook was dead. */
const polled = z.literal("p").optional();
/** The pointer was over an excluded rectangle (the recorder's own controls). */
const ui = z.literal(true).optional();
/** Synthetic input, such as the guided recording's own moves and clicks. */
const inj = z.literal(true).optional();

export const hookEventSchema = z.discriminatedUnion("e", [
  z.strictObject({
    e: z.literal("ready"),
    t: time,
    pid: z.int().positive(),
    v: z.string().min(1).max(64),
    keys: z.boolean(),
  }),
  z.strictObject({
    e: z.literal("hb"),
    t: time,
    /** Events waiting for the writer thread. */
    q: z.int().nonnegative(),
    /** Moves merged because the queue was full (clicks and keys are never merged). */
    drop: z.int().nonnegative(),
    hook: z.enum(["ok", "dead"]),
    /** Times the hook was reinstalled. */
    re: z.int().nonnegative(),
    /** Lines waiting for this process to read stdout. */
    out: z.int().nonnegative(),
    /** Lines waiting for the journal's disk thread. */
    jq: z.int().nonnegative(),
  }),
  z.strictObject({
    e: z.literal("m"),
    t: time,
    x: coordinate,
    y: coordinate,
    src: polled,
    ui,
    inj,
  }),
  z.strictObject({
    e: z.literal("d"),
    t: time,
    x: coordinate,
    y: coordinate,
    b: button,
    src: polled,
    ui,
    inj,
  }),
  z.strictObject({
    e: z.literal("u"),
    t: time,
    x: coordinate,
    y: coordinate,
    b: button,
    src: polled,
    ui,
    inj,
  }),
  z.strictObject({
    e: z.literal("w"),
    t: time,
    x: coordinate,
    y: coordinate,
    d: z.int().min(-32768).max(32767),
    h: z.literal(true).optional(),
    src: polled,
    ui,
    inj,
  }),
  /** Shortcut or navigation key; `m` holds the Ctrl, Alt, Shift and Win flags as "1"/"0". */
  z.strictObject({
    e: z.literal("k"),
    t: time,
    vk: z.int().min(1).max(255),
    m: z.string().regex(/^[01]{4}$/),
    inj,
  }),
  /**
   * Something was typed (a key that writes text): the moment only, never which key, at most one
   * every half second (native/helper/KeyRule.cs, TypingGate).
   */
  z.strictObject({ e: z.literal("ty"), t: time, inj }),
  /** Cursor shape changed: a standard name, "hidden", "other" or the id of an `img` event. */
  z.strictObject({ e: z.literal("c"), t: time, id: z.string().min(1).max(32) }),
  z.strictObject({
    e: z.literal("img"),
    id: z.string().min(1).max(32),
    hash: z.string().regex(/^[0-9a-f]{16}$/),
    w: z.int().min(1).max(256),
    h: z.int().min(1).max(256),
    hx: z.int().min(0).max(256),
    hy: z.int().min(0).max(256),
    /** Relative to the journal directory; null when the helper runs without one. */
    file: z
      .string()
      .regex(/^cursors\/[0-9a-f]{16}\.png$/)
      .nullable(),
    /** Standard shape this image belongs to, when it is one of them. */
    std: z.string().nullable(),
    /** Pixels that invert the screen; drawn black in the PNG. */
    inv: z.int().nonnegative(),
  }),
  /**
   * "dead": the mouse hook stopped and the pointer is being polled; "reinstalled": it is back;
   * "keys": typing went unseen and both hooks were installed again.
   */
  z.strictObject({
    e: z.literal("health"),
    t: time,
    hook: z.enum(["dead", "reinstalled", "keys"]),
  }),
  /** Between segments only the cursor shape is kept; keys are dropped inside the hook. */
  z.strictObject({ e: z.literal("pause"), t: time }),
  z.strictObject({ e: z.literal("resume"), t: time }),
  /** A window this helper raised above the others (on) or put back (off). */
  z.strictObject({ e: z.literal("front"), t: time, hwnd, on: z.boolean() }),
  z.strictObject({
    e: z.literal("win"),
    t: time,
    hwnd,
    rect: rect.optional(),
    min: z.boolean().optional(),
    fg: z.boolean().optional(),
    gone: z.literal(true).optional(),
  }),
  /** Text cursor of the focused element; w and h are zero when there is none. */
  z.strictObject({
    e: z.literal("caret"),
    t: time,
    x: coordinate,
    y: coordinate,
    w: size,
    h: size,
  }),
  z.strictObject({ e: z.literal("ack"), t: time, cmd: z.string() }),
  z.strictObject({ e: z.literal("error"), t: time, cmd: z.string(), msg: z.string() }),
  z.strictObject({ e: z.literal("bye"), t: time, drop: z.int().nonnegative() }),
]);
export type HookEvent = z.infer<typeof hookEventSchema>;
export type HookReady = Extract<HookEvent, { e: "ready" }>;

/** Parses one stdout line; undefined for anything that is not a valid event. */
export function parseHookLine(line: string): HookEvent | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  const parsed = hookEventSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** Ctrl, Alt, Shift and Win as bit flags, as the key filter expects them. */
export const KEY_MODIFIERS = { ctrl: 1, alt: 2, shift: 4, win: 8 } as const;

export type HookCommand =
  | { cmd: "exclude"; rects: { x: number; y: number; w: number; h: number }[] }
  /** Keys never shown (the recorder's own shortcuts) and windows of the app whose keys stay. */
  | { cmd: "keys"; block: { vk: number; m: number }[]; allow: string[] }
  | { cmd: "follow"; hwnd: string | null }
  | { cmd: "front"; hwnd: string; on: boolean }
  | { cmd: "caret"; on: boolean }
  /** Outside the recorded segments: no clicks, wheel or keys in the journal. */
  | { cmd: "pause" }
  | { cmd: "resume" };

export const monitorSchema = z.strictObject({
  index: z.int().nonnegative(),
  device: z.string(),
  x: coordinate,
  y: coordinate,
  w: size,
  h: size,
  work: rect,
  primary: z.boolean(),
  dpi: z.int().positive(),
});

export const listSchema = z.strictObject({
  e: z.literal("list"),
  v: z.string(),
  monitors: z.array(monitorSchema),
  /** Desktop Duplication outputs; on adapter 0, `index` is ddagrab's output_idx. */
  outputs: z.array(
    z.strictObject({
      adapter: z.int().nonnegative(),
      index: z.int().nonnegative(),
      device: z.string(),
      x: coordinate,
      y: coordinate,
      w: size,
      h: size,
      attached: z.boolean(),
      rotation: z.int(),
      gpu: z.string().nullable(),
    }),
  ),
  windows: z.array(
    z.strictObject({
      hwnd,
      title: z.string(),
      pid: z.int().nonnegative(),
      exe: z.string().nullable(),
      x: coordinate,
      y: coordinate,
      w: size,
      h: size,
      min: z.boolean(),
    }),
  ),
});
export type DisplayList = z.infer<typeof listSchema>;

/** Desktop Duplication output that shows a monitor; -1 when ddagrab cannot reach it. */
export function duplicationOutput(list: DisplayList, monitor: z.infer<typeof monitorSchema>) {
  // ddagrab opens the default adapter, the first one DXGI enumerates.
  return (
    list.outputs.find((o) => o.adapter === 0 && o.attached && o.device === monitor.device)?.index ??
    -1
  );
}

export const inputReplySchema = z.union([
  z.strictObject({ ready: z.literal(true) }),
  z.strictObject({
    id: z.union([z.int(), z.string(), z.null()]),
    ok: z.literal(true),
    result: z.unknown(),
  }),
  z.strictObject({
    id: z.union([z.int(), z.string(), z.null()]),
    ok: z.literal(false),
    error: z.string(),
  }),
]);
export type InputReply = z.infer<typeof inputReplySchema>;

export const glideResultSchema = z.strictObject({
  x: coordinate,
  y: coordinate,
  /** Fraction of the movement's time reached; 1 means it arrived. */
  at: z.number().min(0).max(1),
  /** Seconds between two steps when the helper fell behind and stopped instead of jumping. */
  late: z.number().positive().optional(),
  halted: z.literal(true).optional(),
});
export type GlideResult = z.infer<typeof glideResultSchema>;

/** Answer to halt: false when the named glide had already ended. */
export const haltResultSchema = z.strictObject({ halted: z.boolean() });
