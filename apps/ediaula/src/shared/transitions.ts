import { adjacency, CUT_TOUCH, clipEnd } from "./timeline.ts";
import type { Clip, Project } from "./types.ts";

/**
 * Transitions at a cut between two clips on the same track, stored on the second clip.
 * The preview and the export both draw the project through withTransitions(), which turns them
 * into a short tail of the first clip drawn over the second one (dissolving, wiped away by a
 * mask, sliding, zooming, turning like a page or peeling like paper), plain fades (through
 * black), or effects over the whole frame centered on the cut (glitch, color transitions).
 * Every curve lives here: the export evaluates the ffmpeg expressions, the preview evaluates the
 * very same expressions in JavaScript (exprFn) or the same numbers as CSS.
 */

export type ColorFxKind = "colorwipe" | "colorbars" | "colorcircles" | "colorpanels" | "colorsplit";

export type TransitionKind =
  | "dissolve"
  | "black"
  | "wipe-right"
  | "wipe-left"
  | "wipe-up"
  | "wipe-down"
  | "circle-open"
  | "circle-close"
  | "clock"
  | "slide"
  | "zoom"
  | "page"
  | "fold"
  | "glitch"
  | ColorFxKind;

export interface Transition {
  kind: TransitionKind;
  /** Seconds. */
  duration: number;
  /** Color transitions: their colors, front first (from the project palette unless chosen). */
  colors?: string[];
}

export const TRANSITIONS: {
  id: TransitionKind;
  label: string;
  hint: string;
  group: "Clássicas" | "Formas" | "Movimento" | "Cores" | "Efeitos";
}[] = [
  { id: "dissolve", label: "Dissolver", hint: "Uma cena se mistura na outra", group: "Clássicas" },
  { id: "black", label: "Passar pelo preto", hint: "Escurece e clareia", group: "Clássicas" },
  {
    id: "wipe-right",
    label: "Cortina →",
    hint: "Uma linha varre da esquerda para a direita",
    group: "Formas",
  },
  {
    id: "wipe-left",
    label: "Cortina ←",
    hint: "Uma linha varre da direita para a esquerda",
    group: "Formas",
  },
  {
    id: "wipe-down",
    label: "Cortina ↓",
    hint: "Uma linha varre de cima para baixo",
    group: "Formas",
  },
  {
    id: "wipe-up",
    label: "Cortina ↑",
    hint: "Uma linha varre de baixo para cima",
    group: "Formas",
  },
  {
    id: "circle-open",
    label: "Círculo abrindo",
    hint: "A nova cena aparece num círculo que cresce",
    group: "Formas",
  },
  {
    id: "circle-close",
    label: "Círculo fechando",
    hint: "A cena some num círculo que fecha",
    group: "Formas",
  },
  { id: "clock", label: "Relógio", hint: "Um ponteiro varre a tela", group: "Formas" },
  { id: "slide", label: "Deslizar", hint: "A cena sai inteira pela esquerda", group: "Movimento" },
  { id: "zoom", label: "Zoom", hint: "A cena cresce e some", group: "Movimento" },
  {
    id: "page",
    label: "Virar página",
    hint: "A cena vira como a página de um livro",
    group: "Movimento",
  },
  {
    id: "fold",
    label: "Dobrar papel",
    hint: "A cena descola do canto como uma folha de papel",
    group: "Movimento",
  },
  {
    id: "colorwipe",
    label: "Giro de cores",
    hint: "Faixas coloridas giram e cruzam a tela",
    group: "Cores",
  },
  {
    id: "colorbars",
    label: "Faixas de cor",
    hint: "Barras coloridas descem em cascata",
    group: "Cores",
  },
  {
    id: "colorcircles",
    label: "Círculos de cor",
    hint: "Anéis coloridos crescem do centro e se abrem",
    group: "Cores",
  },
  {
    id: "colorpanels",
    label: "Painéis de cor",
    hint: "Placas coloridas diagonais cruzam a tela",
    group: "Cores",
  },
  {
    id: "colorsplit",
    label: "Portas de cor",
    hint: "Metades coloridas entram dos lados e se cruzam",
    group: "Cores",
  },
  {
    id: "glitch",
    label: "Glitch",
    hint: "Falha digital: blocos, cores separadas e flashes",
    group: "Efeitos",
  },
];

export const DEFAULT_TRANSITION: Transition = { kind: "dissolve", duration: 0.6 };
export const DEFAULT_WIPE_COLORS = ["#3D6BFF", "#9B7BFF", "#C8F031"];

/** Ready-made color sets for color transitions (the lesson palette is offered first by the app). */
export const COLOR_SETS: { id: string; label: string; colors: string[] }[] = [
  {
    id: "rainbow",
    label: "Arco-íris",
    colors: ["#FF4D4D", "#FFD60A", "#2FBF71", "#3D6BFF", "#9B7BFF"],
  },
  { id: "neon", label: "Neon", colors: ["#00F0FF", "#FF2BD6", "#C8F031"] },
  { id: "pastel", label: "Pastel", colors: ["#FFB3C7", "#B5E3FF", "#FFF1A8"] },
  { id: "fire", label: "Fogo", colors: ["#FF4D4D", "#FF8A3D", "#FFD60A"] },
  { id: "night", label: "Noite", colors: ["#121A30", "#1B5CF3", "#6E9BFF"] },
  { id: "mono", label: "Preto e branco", colors: ["#12140A", "#FFFFFF", "#6B7280"] },
];

/** Kinds drawn as a tail of the outgoing clip with an alpha mask that cuts it away. */
const MASKS = new Set<TransitionKind>([
  "wipe-right",
  "wipe-left",
  "wipe-up",
  "wipe-down",
  "circle-open",
  "circle-close",
  "clock",
  "glitch",
]);
export const isMask = (k: TransitionKind | undefined): k is TransitionKind => !!k && MASKS.has(k);
const COLOR_FX = new Set<TransitionKind>([
  "colorwipe",
  "colorbars",
  "colorcircles",
  "colorpanels",
  "colorsplit",
]);
export const isColorFx = (k: TransitionKind | undefined): k is ColorFxKind =>
  !!k && COLOR_FX.has(k);
/** Kinds drawn over the whole frame around the cut. */
export const isCutFx = (k: TransitionKind): k is "glitch" | ColorFxKind =>
  k === "glitch" || isColorFx(k);

/** The clip that ends where `clip` starts, on the same track (adjacency() finds every pair). */
export function previousClip(clips: Clip[], clip: Clip): Clip | undefined {
  return clips.find(
    (c) =>
      c.id !== clip.id &&
      c.trackId === clip.trackId &&
      Math.abs(clipEnd(c) - clip.start) < CUT_TOUCH,
  );
}

export interface DerivedClip extends Clip {
  /** Seconds the clip runs past its real end, picture only. If the source ends first, its last frame holds. */
  tail?: number;
  /** Drawn above the other clips of its track (the outgoing side of a transition). */
  drawAfter?: boolean;
  /** How the tail goes away when it is not a plain dissolve or motion: a mask, a page turn or a paper fold. */
  tailFx?: TransitionKind;
}

/** An effect over the whole frame, centered on a cut. */
export interface CutFx {
  kind: "glitch" | ColorFxKind;
  /** The cut, timeline seconds. */
  at: number;
  duration: number;
  colors: string[];
}

export type DerivedProject = Project & { clips: DerivedClip[]; cutFx?: CutFx[] };

export function withTransitions(project: Project): DerivedProject {
  if (!project.clips.some((c) => c.transition)) return project;
  const clips = new Map<string, DerivedClip>(project.clips.map((c) => [c.id, { ...c }]));
  const cutFx: CutFx[] = [];
  const previous = adjacency(project.clips);
  for (const b of project.clips) {
    if (!b.transition) continue;
    const a = previous.get(b.id);
    if (!a) continue;
    const kind = b.transition.kind;
    const d = Math.max(0.1, Math.min(b.transition.duration, b.duration / 2, a.duration / 2));
    const A = clips.get(a.id)!;
    const B = clips.get(b.id)!;
    if (isCutFx(kind)) {
      cutFx.push({
        kind,
        at: b.start,
        duration: b.transition.duration,
        colors: b.transition.colors?.length ? b.transition.colors : DEFAULT_WIPE_COLORS,
      });
      if (kind !== "glitch") continue;
    }
    if (kind === "black") {
      A.fadeOut = Math.max(A.fadeOut ?? 0, d / 2);
      A.exit = A.exit && A.exit !== "fade" ? A.exit : "fade";
      B.fadeIn = Math.max(B.fadeIn ?? 0, d / 2);
      B.enter = B.enter && B.enter !== "fade" ? B.enter : "fade";
      continue;
    }
    // The outgoing picture continues over the incoming one and goes away. For the glitch it lingers
    // in broken blocks during the second half.
    const tail = kind === "glitch" ? d / 2 : d;
    A.tail = tail;
    A.duration = a.duration + tail;
    A.drawAfter = true;
    A.fadeOut = tail;
    if (kind === "dissolve") A.exit = "fade";
    else if (kind === "slide") A.exit = "push-left";
    else if (kind === "zoom") A.exit = "zoom";
    else {
      // Masks, page turn and paper fold: no fade from the motion system (a page dims at the very end).
      A.tailFx = kind;
      A.fadeOut = kind === "page" ? tail * 0.35 : undefined;
      A.exit = kind === "page" ? "fade" : undefined;
    }
  }
  return {
    ...project,
    clips: project.clips.map((c) => clips.get(c.id)!),
    ...(cutFx.length ? { cutFx } : {}),
  };
}

// ---- Shared curves ----

const n = (v: number): string => (Math.round(v * 10000) / 10000).toString();
export const smoothstep = (p: number): number => p * p * (3 - 2 * p);
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
/** Smoothstep of an expression, clipped to 0..1. */
const sm = (x: string): string => `(clip(${x},0,1)*clip(${x},0,1)*(3-2*clip(${x},0,1)))`;

/**
 * An ffmpeg expression (numbers, + - * /, T, PI, clip, min, max, abs, sin, cos, hypot, floor,
 * gt, gte, lt, lte, between, if) as a JavaScript function of T: the preview evaluates exactly what
 * the export evaluates.
 */
const fnCache = new Map<string, (T: number) => number>();

const FUNCS: Record<string, (...a: number[]) => number> = {
  clip: (v, a, b) => Math.min(b, Math.max(a, v)),
  min: Math.min,
  max: Math.max,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  hypot: Math.hypot,
  floor: Math.floor,
  mod: (a, b) => a - b * Math.floor(a / b),
  gt: (a, b) => +(a > b),
  gte: (a, b) => +(a >= b),
  lt: (a, b) => +(a < b),
  lte: (a, b) => +(a <= b),
  between: (x, a, b) => +(x >= a && x <= b),
  if: (c, a, b = 0) => (c ? a : b),
};

type Node = (T: number) => number;

/**
 * A small parser for the ffmpeg expressions above (no eval: the app's security policy forbids
 * running strings as code). Grammar: sum := product (('+'|'-') product)*; product := unary
 * (('*'|'/') unary)*; unary := '-' unary | atom; atom := number | T | PI | name '(' args ')' | '(' sum ')'.
 */
function parse(src: string): Node {
  let i = 0;
  const peek = (): string => src[i];
  const skip = (): void => {
    while (src[i] === " ") i++;
  };
  const sum = (): Node => {
    let left = product();
    skip();
    while (peek() === "+" || peek() === "-") {
      const op = src[i++];
      const right = product();
      const l = left;
      left = op === "+" ? (T) => l(T) + right(T) : (T) => l(T) - right(T);
      skip();
    }
    return left;
  };
  const product = (): Node => {
    let left = unary();
    skip();
    while (peek() === "*" || peek() === "/") {
      const op = src[i++];
      const right = unary();
      const l = left;
      left = op === "*" ? (T) => l(T) * right(T) : (T) => l(T) / right(T);
      skip();
    }
    return left;
  };
  const unary = (): Node => {
    skip();
    if (peek() === "-") {
      i++;
      const v = unary();
      return (T) => -v(T);
    }
    if (peek() === "+") {
      i++;
      return unary();
    }
    return atom();
  };
  const atom = (): Node => {
    skip();
    if (peek() === "(") {
      i++;
      const v = sum();
      skip();
      if (src[i++] !== ")") throw new Error(`expected ) at ${i} in ${src}`);
      return v;
    }
    const num = /^\d*\.?\d+(e[-+]?\d+)?/i.exec(src.slice(i));
    if (num) {
      i += num[0].length;
      const v = Number(num[0]);
      return () => v;
    }
    const name = /^[A-Za-z_]\w*/.exec(src.slice(i));
    if (!name) throw new Error(`unexpected ${peek()} at ${i} in ${src}`);
    i += name[0].length;
    if (name[0] === "T") return (T) => T;
    if (name[0] === "PI") return () => Math.PI;
    const fn = FUNCS[name[0]];
    if (!fn) throw new Error(`unknown ${name[0]} in ${src}`);
    skip();
    if (src[i++] !== "(") throw new Error(`expected ( after ${name[0]}`);
    const args: Node[] = [];
    skip();
    if (peek() !== ")")
      for (;;) {
        args.push(sum());
        skip();
        if (peek() === ",") {
          i++;
          continue;
        }
        break;
      }
    if (src[i++] !== ")") throw new Error(`expected ) closing ${name[0]} in ${src}`);
    return (T) => fn(...args.map((a) => a(T)));
  };
  const root = sum();
  skip();
  if (i < src.length) throw new Error(`unexpected ${src.slice(i)} in ${src}`);
  return root;
}

export function exprFn(expr: string): (T: number) => number {
  let f = fnCache.get(expr);
  if (!f) {
    f = parse(expr);
    fnCache.set(expr, f);
  }
  return f;
}

/** Progress of a tail (0 at the cut, 1 when it is gone), eased. */
export function tailProgress(
  c: Pick<DerivedClip, "start" | "duration" | "tail">,
  t: number,
): number {
  if (!c.tail) return 0;
  return smoothstep(clamp01((t - (c.start + c.duration - c.tail)) / c.tail));
}

/** The same eased progress as an ffmpeg expression of the timeline time `T`. */
export function tailProgressExpr(
  c: Pick<DerivedClip, "start" | "duration" | "tail">,
  T = "T",
): string {
  return sm(`(${T}-${n(c.start + c.duration - c.tail!)})/${n(c.tail!)}`);
}

/** Glitch blocks of the outgoing scene: 12 × 8 cells reshuffled 30 times a second. */
export const GLITCH_GRID = { cols: 12, rows: 8, rate: 30 };

/**
 * Glitch time slots count from the cut, not from the start of the lesson, so the same cut glitches
 * the same way wherever it lands (an export segment that only moved is reused). The phase keeps
 * slot edges away from frame times, where rounding could pick either slot.
 */
const GLITCH_PHASE = 0.137;
export const glitchSlot = (sinceCut: number, rate = 30): number =>
  Math.floor(sinceCut * rate + GLITCH_PHASE);
const slotExpr = (sinceCut: string, rate: number): string =>
  `floor((${sinceCut})*${rate}+${GLITCH_PHASE})`;
const blockHash = (bx: string, by: string, slot: string): string => {
  const r = `sin(${bx}*127.1+${by}*311.7+${slot}*74.7)*43758.5453`;
  return `(${r}-floor(${r}))`;
};

/** Whether glitch block (bx, by) of the outgoing scene still shows at time slot `slot`, for eased progress e. */
export function glitchBlockVisible(bx: number, by: number, slot: number, e: number): boolean {
  const r = Math.sin(bx * 127.1 + by * 311.7 + slot * 74.7) * 43758.5453;
  return r - Math.floor(r) > e;
}

/**
 * The mask of a wiped tail as an ffmpeg condition: 1 where the outgoing picture still shows,
 * for a picture of W × H at pixel (X, Y) and eased progress E. `sinceCut` is the time from the
 * cut (the glitch reshuffles its blocks by it).
 */
export function maskExpr(kind: TransitionKind, E: string, sinceCut = "T"): string {
  const R = "hypot(W,H)/2";
  const D = "hypot(X-W/2,Y-H/2)";
  switch (kind) {
    case "wipe-right":
      return `gte(X,W*${E})`;
    case "wipe-left":
      return `lte(X,W*(1-${E}))`;
    case "wipe-down":
      return `gte(Y,H*${E})`;
    case "wipe-up":
      return `lte(Y,H*(1-${E}))`;
    case "circle-open":
      return `gte(${D},${E}*${R})`;
    case "circle-close":
      return `lte(${D},(1-${E})*${R})`;
    case "clock":
      // Clockwise from 12 o'clock.
      return `gte(mod(atan2(X-W/2,H/2-Y)+2*PI,2*PI),${E}*2*PI)`;
    case "glitch":
      return `gt(${blockHash(`floor(X/W*${GLITCH_GRID.cols})`, `floor(Y/H*${GLITCH_GRID.rows})`, slotExpr(sinceCut, GLITCH_GRID.rate))},${E})`;
    default:
      return "1";
  }
}

/** The same mask for the preview, as CSS on a layer of w × h screen pixels (glitch blocks are drawn by the app). */
export function maskCss(
  kind: TransitionKind,
  e: number,
  w: number,
  h: number,
): { clipPath?: string; mask?: string } {
  const pct = (v: number): string => `${(v * 100).toFixed(3)}%`;
  const R = Math.hypot(w, h) / 2;
  switch (kind) {
    case "wipe-right":
      return { clipPath: `inset(0 0 0 ${pct(e)})` };
    case "wipe-left":
      return { clipPath: `inset(0 ${pct(e)} 0 0)` };
    case "wipe-down":
      return { clipPath: `inset(${pct(e)} 0 0 0)` };
    case "wipe-up":
      return { clipPath: `inset(0 0 ${pct(e)} 0)` };
    case "circle-close":
      return { clipPath: `circle(${((1 - e) * R).toFixed(2)}px at 50% 50%)` };
    case "circle-open":
      return {
        mask: `radial-gradient(circle at 50% 50%, transparent ${(e * R).toFixed(2)}px, #000 ${(e * R).toFixed(2)}px)`,
      };
    case "clock":
      return {
        mask: `conic-gradient(from 0deg at 50% 50%, transparent ${(e * 360).toFixed(3)}deg, #000 ${(e * 360).toFixed(3)}deg)`,
      };
    default:
      return {};
  }
}

/** Page turn: the right edge folds toward the left edge (corners TL, TR, BR, BL of a w × h page). */
export function pageCorners(e: number, w: number, h: number): [number, number][] {
  const a = (Math.min(e, 0.985) * Math.PI) / 2;
  const x = w * Math.cos(a);
  const y = h * 0.12 * Math.sin(a);
  return [
    [0, 0],
    [x, y],
    [x, h - y],
    [0, h],
  ];
}

/** CSS matrix3d that maps a w × h box onto four corners (TL, TR, BR, BL): a projective warp. */
export function quadMatrix3d(w: number, h: number, q: [number, number][]): string {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  let g = 0;
  let k = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const det = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / det;
    k = (dx1 * dy3 - dx3 * dy1) / det;
  }
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + k * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + k * y3;
  // Unit square → quad, then the box's pixels → unit square; CSS lists columns.
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1];
  return `matrix3d(${m.map((v) => (Math.abs(v) < 1e-12 ? 0 : v)).join(",")})`;
}

// ---- Paper fold ----

/**
 * A sheet of paper peeling from the bottom-right corner of a w × h picture: the fold line runs
 * across the direction `u`; past it the page is gone (the next scene shows, with the shadow the
 * curl casts), and the folded flap lies mirrored on top of what is left, showing the back of the
 * paper with a faint see-through of the picture.
 */
export const FOLD = {
  u: [0.857, 0.514] as [number, number],
  paper: [243, 239, 230],
  seeThrough: 0.14,
  shadow: 0.03,
};

/** Fold line position: m = x·u values below it are still page. */
export function foldLine(e: number, w: number, h: number): number {
  const mMax = w * FOLD.u[0] + h * FOLD.u[1];
  return mMax * (1 - 1.06 * e);
}

/** geq expressions (r, g, b, a) of the folding page for eased progress E, on an RGBA picture W × H. */
export function foldExprs(E: string): { r: string; g: string; b: string; a: string } {
  const [ux, uy] = FOLD.u;
  const mMax = `(W*${ux}+H*${uy})`;
  const C = `(${mMax}*(1-1.06*${E}))`;
  const D = `(${C}-(X*${ux}+Y*${uy}))`;
  const XR = `(X+2*${D}*${ux})`;
  const YR = `(Y+2*${D}*${uy})`;
  const flap = `(gte(${D},0)*between(${XR},0,W-1)*between(${YR},0,H-1))`;
  const shade = `(0.78+0.22*clip(${D}/(0.18*${mMax}),0,1))`;
  const ch = (c: "r" | "g" | "b", paper: number): string =>
    `if(${flap},${paper}*${shade}*${n(1 - FOLD.seeThrough)}+${n(FOLD.seeThrough)}*${c}(${XR},${YR}),if(gte(${D},0),${c}(X,Y),0))`;
  const shadowA = `(${n(0.45 * 255)}*clip(1+${D}/(${FOLD.shadow}*${mMax}),0,1))`;
  return {
    r: ch("r", FOLD.paper[0]),
    g: ch("g", FOLD.paper[1]),
    b: ch("b", FOLD.paper[2]),
    a: `if(${flap},255,if(gte(${D},0),alpha(X,Y),${shadowA}))`,
  };
}

/** Polygon (in w × h box pixels) of a rectangle clipped to the half-plane x·u ≤ c (or ≥ c). */
function clipBox(w: number, h: number, c: number, keepBelow: boolean): [number, number][] {
  const [ux, uy] = FOLD.u;
  const pts: [number, number][] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const side = (p: [number, number]): number =>
    keepBelow ? c - (p[0] * ux + p[1] * uy) : p[0] * ux + p[1] * uy - c;
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if (sa * sb < 0) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** For the preview: what is left of the page, and the folded flap (both polygons in box pixels). */
export function foldGeometry(
  e: number,
  w: number,
  h: number,
): { page: [number, number][]; flap: [number, number][]; line: number } {
  const c = foldLine(e, w, h);
  const [ux, uy] = FOLD.u;
  const reflect = ([x, y]: [number, number]): [number, number] => {
    const d = c - (x * ux + y * uy);
    return [x + 2 * d * ux, y + 2 * d * uy];
  };
  return { page: clipBox(w, h, c, true), flap: clipBox(w, h, c, false).map(reflect), line: c };
}

// ---- Effects centered on a cut ----

/** When a cut effect is on screen. */
export function cutFxWindow(fx: CutFx): [number, number] {
  return fx.kind === "glitch"
    ? [fx.at - fx.duration / 2, fx.at + fx.duration / 2]
    : [fx.at - fx.duration * 0.65, fx.at + fx.duration * 0.65];
}

/**
 * Shapes of a color transition, front first, with their parameters as expressions of T in frame
 * pixels: rect (x0, y0, x1, y1), slab (an endless band of `width` through cx, cy, turned by
 * `angle`) or ring (center, inner and outer radius). At the cut the front shape covers the frame.
 */
export type FxShape =
  | { type: "rect"; color: string; x0: string; y0: string; x1: string; y1: string }
  | { type: "slab"; color: string; cx: string; cy: string; angle: string; width: string }
  | { type: "ring"; color: string; cx: string; cy: string; rIn: string; rOut: string };

export function colorFxShapes(fx: CutFx, W: number, H: number): FxShape[] {
  const d = fx.duration;
  const at = fx.at;
  const colors = fx.colors.length ? fx.colors : DEFAULT_WIPE_COLORS;
  const k = colors.length;
  const diag = Math.hypot(W, H);
  switch (fx.kind) {
    case "colorwipe": {
      // Endless bands spinning while they travel across; each one a little ahead of the one in front.
      const size = 2 * diag;
      const travel = d * 0.8;
      return colors.map((color, i) => {
        const p = `((T-${n(at - travel / 2)}+${n(i * d * 0.1)})/${n(travel)})`;
        return {
          type: "slab",
          color,
          cx: `(${n(W / 2)}+(1-2*${p})*${n(W / 2 + size / 2)})`,
          cy: n(H / 2),
          angle: `((-25+50*${p})*PI/180)`,
          width: n(size),
        };
      });
    }
    case "colorpanels": {
      // Narrower tilted panels in a row, sliding across without turning.
      const a = (22 * Math.PI) / 180;
      const width = (W * Math.cos(a) + H * Math.sin(a)) * 1.08;
      const reach = W / 2 + width / 2 / Math.cos(a) + (H / 2) * Math.tan(a) + 40;
      const travel = d * 0.9;
      return colors.map((color, i) => {
        const p = `((T-${n(at - travel / 2)}+${n(i * d * 0.16)})/${n(travel)})`;
        return {
          type: "slab",
          color,
          cx: `(${n(W / 2)}+(1-2*${p})*${n(reach)})`,
          cy: n(H / 2),
          angle: n(a),
          width: n(width),
        };
      });
    }
    case "colorbars": {
      // Six bars fall from the top one after the other, then fall away.
      const N = 6;
      const step = d * 0.04;
      const tau = d / 2 - (N - 1) * step;
      const bars: FxShape[] = [];
      for (let b = 0; b < N; b++) {
        const ein = sm(`(T-${n(at - d / 2 + b * step)})/${n(tau)}`);
        const eout = sm(`(T-${n(at + b * step)})/${n(tau)}`);
        bars.push({
          type: "rect",
          color: colors[b % k],
          x0: n((b * W) / N - 1),
          x1: n(((b + 1) * W) / N + 1),
          y0: `(${H}*${eout})`,
          y1: `(${H}*${ein})`,
        });
      }
      return bars;
    }
    case "colorcircles": {
      // Rings grow from the center (the back ones first); after the cut their middles open.
      const R = diag / 2 + 4;
      const step = d * 0.08;
      const tau = d / 2 - (k - 1) * step;
      return colors.map((color, i) => ({
        type: "ring",
        color,
        cx: n(W / 2),
        cy: n(H / 2),
        rOut: `(${n(R)}*${sm(`(T-${n(at - d / 2 + (k - 1 - i) * step)})/${n(tau)}`)})`,
        rIn: `(${n(R)}*${sm(`(T-${n(at + i * step)})/${n(tau)}`)})`,
      }));
    }
    case "colorsplit": {
      // The top halves come in from the left and the bottom halves from the right, then cross out.
      const step = d * 0.07;
      const tau = d / 2 - (k - 1) * step;
      return colors.flatMap((color, i) => {
        const ein = sm(`(T-${n(at - d / 2 + (k - 1 - i) * step)})/${n(tau)}`);
        const eout = sm(`(T-${n(at + i * step)})/${n(tau)}`);
        const top = `(${W}*(${ein}+${eout}-1))`;
        const bottom = `(${W}*(1-${ein}-${eout}))`;
        return [
          { type: "rect", color, x0: top, x1: `(${top}+${W})`, y0: "0", y1: n(H / 2 + 1) },
          { type: "rect", color, x0: bottom, x1: `(${bottom}+${W})`, y0: n(H / 2 - 1), y1: n(H) },
        ] as FxShape[];
      });
    }
    default:
      return [];
  }
}

/** ffmpeg condition: is the pixel (X, Y in frame pixels via XL, YL) inside the shape? */
export function shapeExpr(s: FxShape, XL: string, YL: string): string {
  switch (s.type) {
    case "rect":
      return `gte(${XL},${s.x0})*lt(${XL},${s.x1})*gte(${YL},${s.y0})*lt(${YL},${s.y1})`;
    case "slab":
      return `lt(abs((${XL}-${s.cx})*cos(${s.angle})+(${YL}-${s.cy})*sin(${s.angle})),${s.width}/2)`;
    case "ring":
      return `between(hypot(${XL}-${s.cx},${YL}-${s.cy}),${s.rIn},${s.rOut})*gt(${s.rOut},${s.rIn})`;
  }
}

/** Glitch on the whole frame: strength (0..1) at time T, peaking at the cut. */
export function glitchAmpExpr(fx: CutFx): string {
  return `clip(1-abs(T-${n(fx.at)})/${n(fx.duration / 2)},0,1)`;
}

/** Glitch block shift as a fraction of the width, for block row/col and time slot (30 per second). */
export function glitchShift(row: number, col: number, slot: number, amp: number): number {
  const r = Math.sin(row * 12.9898 + col * 4.1414 + slot * 78.233) * 43758.5453;
  const f = r - Math.floor(r);
  return f > 1 - 0.38 * amp ? (f - 0.5) * 0.2 : 0;
}

/** The same shift as an ffmpeg expression (rows from Y/H, columns from X/W, slots from the cut). */
export function glitchShiftExpr(amp: string, sinceCut = "T"): string {
  const r = `sin(floor(Y/H*18)*12.9898+floor(X/W*6)*4.1414+${slotExpr(sinceCut, 30)}*78.233)*43758.5453`;
  const f = `(${r}-floor(${r}))`;
  return `gt(${f},1-0.38*${amp})*(${f}-0.5)*0.2`;
}
