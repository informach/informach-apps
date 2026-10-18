import {
  BORDER_WIDTH,
  clipLayout,
  DEFAULT_TRANSFORM,
  isMoving,
  maskRadius,
  motionExprs,
  shadowOffset,
  shadowReach,
} from "../compose.ts";
import { cursorOverlayExpressions } from "../cursor-expressions.ts";
import { keyframeExprs } from "../keyframes.ts";
import { clipEnd, clipSpeed, sourceEnd, sourceLength } from "../timeline.ts";
import {
  type CutFx,
  colorFxShapes,
  cutFxWindow,
  type DerivedClip,
  type DerivedProject,
  foldExprs,
  glitchAmpExpr,
  glitchShiftExpr,
  isMask,
  maskExpr,
  shapeExpr,
  tailProgressExpr,
} from "../transitions.ts";
import type { Asset, Clip, ExportSpec } from "../types.ts";
import { zoomExprs, zoomsIn } from "../zoom.ts";
import { entryView, frameClock, zoomLayerFilter } from "../zoomLayer.ts";
import { OUTPUT_PARAMS, type SourceMatrix, type SourceRange, TO_YUVA, yuv709 } from "./color.ts";
import { frameAt, frameTime, type Rate } from "./frames.ts";
import { type FxAsset, type FxProvider, fxGraph } from "./fx.ts";

/**
 * The picture of a stretch of the lesson, [from, from + frames) on the frame grid, as one FFmpeg
 * command. Everything keeps the lesson's own clock: the canvas starts at `from`, each clip is read
 * from the moment of its source shown there, and every enable, fade, keyframe, cursor position
 * and burned caption is in seconds of the timeline, so a stretch renders exactly the frames the
 * whole lesson would have there. Only at the end does the stream restart at zero for its file.
 */

export interface VideoWindow {
  /** First frame of the stretch. */
  from: number;
  frames: number;
}

/** What the main process knows of a file it will read (FFprobe), when it knows it. */
export interface MediaFacts {
  matrix?: SourceMatrix;
  range?: SourceRange;
  alpha?: boolean;
  codec?: string;
}
export type MediaLookup = (path: string) => MediaFacts | undefined;

/**
 * Transparency in the picture: WebM says it in a tag (FFmpeg's own VP8/VP9 decoders report a
 * format without alpha), other files in the pixel format (ProRes 4444, PNG, QuickTime RLE).
 */
export function hasAlpha(
  pixFmt: string | undefined,
  tags: Record<string, string> | undefined,
): boolean {
  const mode = Object.entries(tags ?? {}).find(([k]) => k.toLowerCase() === "alpha_mode")?.[1];
  return mode === "1" || /^(yuva|rgba|bgra|argb|abgr|ya|gbrap|pal8)/.test(pixFmt ?? "");
}

export interface VideoPlan {
  inputArgs: string[];
  filter: string;
  /** The graph's output label. */
  output: string;
  /** Project media the plan reads (checked against the selected files). */
  media: string[];
  /** The app's own files it reads (keyed avatars, cursor sprites, effect pictures). */
  internal: string[];
  frames: number;
  width: number;
  height: number;
}

const n = (v: number): string => (Math.round(v * 1000) / 1000).toString();
/** Source times keep microseconds, so frame times like 10.0333 do not drift. */
const us = (v: number): string => (Math.round(v * 1e6) / 1e6).toString();
const even = (v: number): number => Math.max(2, Math.round(v / 2) * 2);

/** Size the lesson is composed at (a vertical export fits it into the tall frame afterwards). */
export function composeSize(
  project: Pick<DerivedProject, "settings">,
  spec: Pick<ExportSpec, "width" | "height" | "vertical">,
): { W: number; H: number } {
  return spec.vertical
    ? {
        W: even((spec.width * project.settings.width) / project.settings.height),
        H: spec.width,
      }
    : { W: spec.width, H: spec.height };
}

/** Clips in the order they are drawn: lowest track first, transition tails over their track. */
export function drawOrder(project: DerivedProject): DerivedClip[] {
  const assets = new Set(project.assets.map((a) => a.id));
  const order = new Map(project.tracks.map((t, i) => [t.id, i]));
  const clips: DerivedClip[] = project.clips;
  return clips
    .filter((c) => assets.has(c.assetId) && order.has(c.trackId))
    .sort(
      (a, b) =>
        (order.get(b.trackId) ?? 0) - (order.get(a.trackId) ?? 0) ||
        +!!a.drawAfter - +!!b.drawAfter ||
        a.start - b.start,
    );
}

/** The cached video with the background removed, when the avatar's cut-out is ready. */
export const keyedPath = (asset: Asset): string | undefined =>
  asset.kind === "video" && asset.key && asset.keyStatus === "ready" ? asset.keyed : undefined;

/** A clip's frames on the grid and the part of them inside a window, in the clip's own frames. */
export function clipFrames(
  c: Pick<Clip, "start" | "duration">,
  r: Rate,
  win: VideoWindow,
): { start: number; end: number; k0: number; k1: number } | null {
  const start = frameAt(c.start, r);
  const end = frameAt(clipEnd(c), r);
  const from = Math.max(win.from, start);
  const to = Math.min(win.from + win.frames, end);
  if (to <= from) return null;
  return { start, end, k0: from - start, k1: to - start };
}

/** A glitch or a color transition drawn over the whole composite (W × H) while it lasts. */
export function cutFxFilter(fx: CutFx, W: number, H: number): string {
  const [a, b] = cutFxWindow(fx);
  // Times in full: the same cut a few frames later must give the very same pixels.
  const enable = `enable='between(t,${a},${b})'`;
  if (fx.kind === "glitch") {
    // Blocks jump sideways, thin lines jitter, the colors split (chroma pushed both ways),
    // scanlines darken, some rows flash inverted and grain covers it; strongest at the cut and
    // gone at the edges (strength 0 leaves the picture as it is, so the frames at the edges are
    // the same whether the window takes them in or not). Everything is seeded by the time since
    // the cut, so the glitch is the same wherever it is.
    const since = `(T-${fx.at})`;
    const slot = `floor(${since}*30+0.137)`;
    const amp = glitchAmpExpr(fx, since);
    const r2 = `sin(floor(Y/H*90)*91.7+${slot}*17.3)*43758.5453`;
    const jit = `gt((${r2}-floor(${r2})),0.93)*((${r2}-floor(${r2}))-0.965)*0.8*${amp}`;
    const off = `W*(${glitchShiftExpr(amp, since)}+${jit})`;
    const rf = `sin(${slot}*3.7+floor(Y/H*6)*1.3)*43758.5453`;
    const flash = `gt((${rf}-floor(${rf})),0.86)*gt(${amp},0.45)`;
    const rg = `sin(X*12.9898+Y*78.233+${slot}*37.719)*43758.5453`;
    const grain = `(((${rg})-floor(${rg}))-0.5)*52*${amp}`;
    const at = (dx: string, dy: string): string =>
      `p(clip(X+${off}+${dx},0,W-1),clip(Y+${dy},0,H-1))`;
    const lum = `if(${flash},255-${at("0", "0")},${at("0", "0")})*(1-0.22*${amp}*mod(floor(Y/2),2))+${grain}`;
    const cb = `if(${flash},256-${at(`0.025*W*${amp}`, `0.012*H*${amp}`)},${at(`0.025*W*${amp}`, `0.012*H*${amp}`)})+${grain}`;
    const cr = `if(${flash},256-${at(`-0.025*W*${amp}`, `-0.012*H*${amp}`)},${at(`-0.025*W*${amp}`, `-0.012*H*${amp}`)})+${grain}`;
    return `format=yuv420p,geq=lum='${lum}':cb='${cb}':cr='${cr}':${enable}`;
  }
  // Color shapes in frame pixels (plane coordinates scaled), the front one tested first.
  const shapes = colorFxShapes(fx, W, H);
  const inside = shapes.map((sh) => shapeExpr(sh, `(X/W*${W})`, `(Y/H*${H})`));
  const plane = (k: 0 | 1 | 2): string =>
    shapes.reduceRight(
      (rest, sh, i) => `if(${inside[i]},${yuv709(sh.color)[k]},${rest})`,
      "p(X,Y)",
    );
  return `format=yuv420p,geq=lum='${plane(0)}':cb='${plane(1)}':cr='${plane(2)}':${enable}`;
}

/** One stretch of a source file read for one clip of the window. */
interface Piece {
  clip: DerivedClip;
  asset: Asset;
  frames: { start: number; end: number; k0: number; k1: number };
  /** File read and the decoder that keeps its alpha. */
  path: string;
  decoder: string[];
  /**
   * Seek point, source seconds. The input keeps the frames from the keyframe before it (no
   * accurate seek), so the frame on screen at the window's first tick is read even when it is
   * seconds older (a still screen in a variable frame rate recording). Never past the file's last
   * frames, so a clip that holds the last frame still reads it.
   */
  at: number;
  /** Source seconds the window shows, [S, E] (the zooms over them apply). */
  S: number;
  E: number;
  /**
   * Source seconds the clip may show, [from, until): from its in-point to the end of its cut
   * (before the frame grid moved it) or of the file. The frames around are never read; the
   * last one before `until` holds when the clip goes on.
   */
  from: number;
  until: number;
  /** A quarter of a frame, for times that land on a frame. */
  tolerance: number;
  internal: boolean;
}

/** A source read once for one piece, or for a run of pieces joined into one stream. */
interface Read {
  input: number;
  /** Seek point of the input, source seconds. */
  at: number;
  /** Labels of the input's stream for each piece. */
  labels: string[];
}

/**
 * Pieces of the same file that follow each other on the track with the same look (a recording
 * cut by the cleanup) are read with one seek and one decoder. Each piece takes its frames from
 * the shared stream and the pieces are joined in order into one layer, so the decoder only runs
 * ahead by what two pieces have in common: a piece may go back at most SHARE_BACK seconds in the
 * source and skip at most SHARE_GAP. Anything else opens its own input.
 */
const SHARE_GAP = 4;
const SHARE_BACK = 0.25;

/** A clip whose layer stays put and shows whole while it lasts, so its pieces can be joined. */
const steady = (c: DerivedClip): boolean =>
  !c.drawAfter && !c.tail && !c.keyframes?.length && !isMoving(c);

/** Whether `p` continues the run that starts at `first` and ends at `last` in one stream. */
function continues(first: Piece, last: Piece, p: Piece): boolean {
  return (
    p.asset.kind !== "image" &&
    p.clip.trackId === last.clip.trackId &&
    p.path === last.path &&
    p.decoder.join(" ") === last.decoder.join(" ") &&
    p.frames.start === last.frames.end &&
    steady(last.clip) &&
    steady(p.clip) &&
    JSON.stringify(p.clip.transform ?? null) === JSON.stringify(last.clip.transform ?? null) &&
    p.at >= first.at &&
    p.S >= last.E - SHARE_BACK &&
    p.S - last.E <= SHARE_GAP
  );
}

export function buildVideoWindowPlan(
  project: DerivedProject,
  spec: ExportSpec,
  r: Rate,
  win: VideoWindow,
  fx: FxProvider = () => null,
  media: MediaLookup = () => undefined,
  firstInput = 0,
): VideoPlan {
  const fps = r.num / r.den;
  const rate = r.text;
  const { W, H } = composeSize(project, spec);
  const T0 = frameTime(win.from, r);
  const T1 = frameTime(win.from + win.frames, r);
  const half = 0.5 / fps;
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const tracks = new Map(project.tracks.map((t) => [t.id, t]));

  const inputArgs: string[] = [];
  const mediaFiles = new Set<string>();
  const internalFiles = new Set<string>();
  let inputs = firstInput;
  const addInput = (path: string, options: string[], internal: boolean): number => {
    inputArgs.push(...options, "-i", path);
    (internal ? internalFiles : mediaFiles).add(path);
    return inputs++;
  };
  const graph: string[] = [];

  // ---- Which clips draw in this window, and what each one reads ----
  const drawn: { clip: DerivedClip; piece?: Piece; layer: boolean }[] = [];
  for (const clip of drawOrder(project)) {
    const asset = assets.get(clip.assetId);
    const track = tracks.get(clip.trackId);
    if (!asset || !track || track.hidden) continue;
    const frames = clipFrames(clip, r, win);
    if (!frames) continue;
    if (clip.zoomLayer) {
      drawn.push({ clip, layer: true });
      continue;
    }
    if (asset.kind === "audio") continue;
    const lay = clipLayout(clip, asset, { width: W, height: H });
    if (Math.round(lay.visible.w) < 2 || Math.round(lay.visible.h) < 2) continue;
    const cutOut = keyedPath(asset);
    const keyed = !!cutOut;
    const path = cutOut ?? asset.path;
    const facts = media(path);
    const alpha = keyed || (facts?.alpha ?? asset.alpha ?? false);
    // A WebM with alpha that was not probed is VP9 (what HeyGen and the app write).
    const codec = facts?.codec ?? (/\.webm$/i.test(path) ? "vp9" : undefined);
    // FFmpeg's own VP8/VP9 decoders drop the alpha plane; libvpx keeps it.
    const decoder =
      keyed || (alpha && codec === "vp9")
        ? ["-c:v", "libvpx-vp9"]
        : alpha && codec === "vp8"
          ? ["-c:v", "libvpx"]
          : [];
    const speed = clipSpeed(clip);
    const srcFps = asset.fps > 0 ? asset.fps : fps;
    const tolerance = 0.25 / Math.max(srcFps, fps);
    const length = sourceLength(asset);
    const S = clip.in + (frames.k0 / fps) * speed;
    const endsHere = frames.end <= win.from + win.frames;
    const E = endsHere
      ? sourceEnd(clip)
      : Math.min(sourceEnd(clip), clip.in + ((frames.k1 + 2) / fps) * speed);
    // The last frame of the file starts at least a frame and a half before its end.
    const lastFrame = length - 1.5 / srcFps;
    drawn.push({
      clip,
      layer: false,
      piece: {
        clip,
        asset,
        frames,
        path,
        decoder,
        at: Math.max(0, Math.min(S - 1 / srcFps - tolerance, length - 2 / srcFps)),
        S,
        E,
        from: Math.max(0, Math.min(clip.in, lastFrame)),
        until: Math.min(clip.sourceStop ?? sourceEnd(clip), length),
        tolerance,
        internal: keyed,
      },
    });
  }

  // ---- Inputs: one per run of pieces of the same file ----
  const reads = new Map<Piece, { read: Read; index: number }>();
  const sprites = new Map<Piece, { read: Read; index: number }>();
  const runs: Piece[][] = [];
  /** The run of each piece drawn as part of a longer one, and its place in it. */
  const joined = new Map<Piece, { run: Piece[]; index: number }>();
  let open: Piece[] | null = null;
  for (const { piece } of drawn) {
    // Only pieces drawn one right after the other join: nothing is drawn between them.
    const last = open?.at(-1);
    if (piece && open && last && continues(open[0], last, piece)) {
      open.push(piece);
      continue;
    }
    open = null;
    if (!piece) continue;
    const fresh = [piece];
    runs.push(fresh);
    if (piece.asset.kind !== "image") open = fresh;
  }
  for (const run of runs) {
    const first = run[0];
    if (first.asset.kind === "image") {
      // A still picture is decoded once and repeated, not read again for every frame.
      const input = addInput(first.path, ["-framerate", rate], false);
      reads.set(first, { read: { input, at: 0, labels: [`${input}:v`] }, index: 0 });
      continue;
    }
    if (run.length > 1) for (const [index, p] of run.entries()) joined.set(p, { run, index });
    const at = first.at;
    // No duration limit on the input: with the frames before the seek point kept, FFmpeg would
    // count it from the keyframe. Each piece stops itself at the end of its cut.
    const open = ["-noaccurate_seek", "-ss", us(at)];
    const add = (path: string, decoder: string[], internal: boolean, tag: string): Read => {
      const input = addInput(path, [...decoder, ...open], internal);
      const labels = run.length === 1 ? [`${input}:v`] : run.map((_, i) => `${tag}${input}_${i}`);
      if (run.length > 1)
        graph.push(`[${input}:v]split=${run.length}${labels.map((l) => `[${l}]`).join("")}`);
      return { input, at, labels };
    };
    const read = add(first.path, first.decoder, first.internal, "s");
    for (const [i, p] of run.entries()) reads.set(p, { read, index: i });
    const cursor = first.asset.cursor ? spec.cursors?.[first.asset.id] : undefined;
    if (cursor) {
      const sprite = add(cursor.sprite, ["-c:v", "libvpx-vp9"], true, "k");
      for (const [i, p] of run.entries()) sprites.set(p, { read: sprite, index: i });
    }
  }

  /**
   * A piece's frames on its clip's clock, exactly k1 - k0 of them from frame k0 (time base one
   * frame). The source frames of the cut, [from, until), go to the frame grid as a single pass
   * would put them; the stream then goes on with its last frame (a file shorter than its clip,
   * the end of a cut), and the window takes its frames from k0, the first one standing in for
   * any tick before the first frame of the cut.
   */
  const timed = (p: Piece, source: { read: Read; index: number }): string => {
    const { read, index } = source;
    const speed = clipSpeed(p.clip);
    // Stream time PTS is source time read.at + PTS; the clip shows source time s at (s - in) / speed.
    const offset = read.at - p.clip.in;
    const shift = offset < 0 ? `-${us(-offset)}/TB` : `+${us(offset)}/TB`;
    const pts = `setpts=round((PTS${shift})${speed === 1 ? "" : `/${us(speed)}`})`;
    const clock = (s: number): string => us((s - p.clip.in - p.tolerance) / speed);
    return (
      `[${read.labels[index]}]${pts},trim=start=${clock(p.from)}:end=${clock(p.until)},` +
      `fps=${rate},tpad=stop_mode=clone:stop=-1,fps=${rate}:start_time=${us(p.frames.k0 / fps)},` +
      `trim=end_frame=${p.frames.k1 - p.frames.k0}`
    );
  };

  // ---- The canvas, on the lesson's clock from this window's first frame (time base one frame) ----
  graph.push(
    `color=c=black:s=${W}x${H}:r=${rate},trim=end_frame=${win.frames},format=yuv420p,setpts=PTS+${win.from}[base]`,
  );
  let current = "base";
  let layer = 0;
  /** Layers of a joined run's pieces, waiting for its last piece. */
  let pending: { v: string[]; shadow: string[] } = { v: [], shadow: [] };

  for (const { clip, piece, layer: isLayer } of drawn) {
    if (isLayer) {
      graph.push(
        `[${current}]${zoomLayerFilter(clip, fps, entryView(project, clip), win.from)}[zl${layer}]`,
      );
      current = `zl${layer}`;
      layer++;
      continue;
    }
    const source = piece && reads.get(piece);
    if (!piece || !source) continue;
    const { asset } = piece;
    const L = layer++;
    const lay = clipLayout(clip, asset, { width: W, height: H });
    const vw = Math.round(lay.visible.w);
    const vh = Math.round(lay.visible.h);
    const speed = clipSpeed(clip);
    const { k0, k1 } = piece.frames;
    // The clip's clock to the lesson's: a whole number of frames (a fraction would be cut off).
    const toLesson = `setpts=PTS+${piece.frames.start}`;
    const end = clipEnd(clip);
    const t = clip.transform;
    const run = joined.get(piece);
    const facts = media(piece.path);
    const keyed = piece.internal;
    const image = asset.kind === "image";
    const alphaContent = keyed || image || (facts?.alpha ?? asset.alpha ?? false);
    // How the source is read into colour: keyed avatars were written by the app in BT.601;
    // stills say it themselves; videos without a tag are BT.709.
    const matrix = keyed ? "bt601" : image ? facts?.matrix : (facts?.matrix ?? "bt709");
    const range = keyed ? "tv" : image ? facts?.range : (facts?.range ?? "tv");
    /**
     * A scale to `size` (or the same size) reading the source colours, to BT.709 YUV or RGBA.
     * When it converts colour, it rounds accurately: shrinking and converting in one pass
     * otherwise drifts by several levels (measured on FFmpeg 6.1 and 9.0).
     */
    const convert = (size: string | null, toYuv: boolean): string => {
      const converts = !(toYuv && matrix === "bt709" && range === "tv");
      return `scale=${[
        size,
        matrix && `in_color_matrix=${matrix}`,
        range && `in_range=${range}`,
        toYuv && "out_color_matrix=bt709",
        toYuv && "out_range=tv",
        converts && "flags=bicubic+accurate_rnd+full_chroma_int",
      ]
        .filter(Boolean)
        .join(":")}`;
    };

    // Source picture on the clip's clock (pointer drawn on it, then the recording's zooms).
    let src = `src${L}`;
    if (image)
      graph.push(
        `[${source.read.labels[0]}]loop=loop=-1:size=1,trim=end_frame=${k1 - k0},settb=${r.den}/${r.num},setpts=N+${k0}[${src}]`,
      );
    else graph.push(`${timed(piece, source)}[${src}]`);
    const sprite = sprites.get(piece);
    const cursor = asset.cursor ? spec.cursors?.[asset.id] : undefined;
    if (sprite && cursor) {
      // The sprite was written in BT.601; it is drawn in the source's own colours.
      const toSource =
        matrix === "bt601" && range !== "pc"
          ? ""
          : `,scale=in_color_matrix=bt601:in_range=tv:out_color_matrix=${matrix ?? "bt709"}:out_range=${range ?? "tv"}`;
      graph.push(`${timed(piece, sprite)}${toSource}[spr${L}]`);
      const xy = cursorOverlayExpressions(cursor, clip, fps, { from: k0, to: k1 });
      graph.push(
        `[${src}][spr${L}]overlay=x='${xy.x}':y='${xy.y}':eval=frame:eof_action=pass[cur${L}]`,
      );
      src = `cur${L}`;
    }
    // The recording's zooms over what this window reads, only while one is on.
    const zooms = image ? [] : zoomsIn(asset.zooms, piece.S - 1 / fps, piece.E);
    if (zooms.length) {
      const e = zoomExprs(
        zooms,
        `(${us(clip.in)}+${frameClock(fps, k0)}${speed === 1 ? "" : `*${n(speed)}`})`,
      );
      const on = zooms
        .map(
          (z) =>
            `between(t,${us((z.start - clip.in) / speed - half)},${us((z.end - clip.in) / speed)})`,
        )
        .join("+");
      const x0 = `(${e.cx}-0.5/${e.scale})*W`;
      const y0 = `(${e.cy}-0.5/${e.scale})*H`;
      const w = `W/${e.scale}`;
      const h = `H/${e.scale}`;
      graph.push(
        `[${src}]perspective=x0='${x0}':y0='${y0}':x1='${x0}+${w}':y1='${y0}':x2='${x0}':y2='${y0}+${h}':x3='${x0}+${w}':y3='${y0}+${h}':eval=frame:interpolation=linear:enable='${on}'[zm${L}]`,
      );
      src = `zm${L}`;
    }

    const c = lay.crop;
    const crop =
      c.left || c.top || c.right || c.bottom
        ? `crop=iw*${n(1 - c.left - c.right)}:ih*${n(1 - c.top - c.bottom)}:iw*${n(c.left)}:ih*${n(c.top)},`
        : "";
    const motion = motionExprs(clip);
    const fades = motion.fades
      .map((f) => `,fade=t=${f.kind}:st=${us(f.start)}:d=${us(f.duration)}:alpha=1`)
      .join("");
    // A joined run fades where its pieces do; a piece without fades then goes the same way.
    const faded = run
      ? run.run.some((p) => motionExprs(p.clip).fades.length > 0)
      : motion.fades.length > 0;
    const enable = `enable='between(t,${us(clip.start - half)},${us(end - half)})'`;
    const kfs = clip.keyframes?.length ? clip.keyframes : undefined;
    const moving = isMoving(clip) || !!kfs;
    const tailStart = clip.tail ? clip.start + clip.duration - clip.tail : 0;
    const tailWindow = `enable='between(t,${n(tailStart)},${n(end)})'`;
    const fold = clip.tailFx === "fold" ? foldExprs(tailProgressExpr(clip)) : null;
    const tailMask = isMask(clip.tailFx)
      ? `,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*${maskExpr(clip.tailFx, tailProgressExpr(clip), `(T-${n(tailStart)})`)}':${tailWindow}`
      : fold
        ? `,geq=r='${fold.r}':g='${fold.g}':b='${fold.b}':a='${fold.a}':${tailWindow}`
        : "";
    const shadow = t?.shadow && t.shadow.opacity > 0 ? t.shadow : undefined;
    const page = clip.tailFx === "page" && !shadow;
    // RGBA only where a per-pixel effect needs red, green and blue; YUV with alpha otherwise.
    const rgba = !!tailMask || page;
    const opacity = lay.opacity < 1 ? lay.opacity : 1;
    const plain =
      !rgba &&
      !alphaContent &&
      !t?.mask &&
      !t?.border &&
      !shadow &&
      opacity === 1 &&
      !faded &&
      !moving;
    const out = `o${L}`;

    /**
     * Draws the layer, and the shadow under it, over what is below. The pieces of a joined run
     * wait for the last one and go on as one layer, each after the other.
     */
    const place = (v: string, sl: string | null, at: [number, number], sAt: [number, number]) => {
      let on = enable;
      let layerLabel = v;
      let shadowLabel = sl;
      if (run) {
        pending.v.push(v);
        if (sl) pending.shadow.push(sl);
        if (run.index < run.run.length - 1) return;
        const head = run.run[0];
        const last = run.run[run.run.length - 1];
        const first = head.frames.start + head.frames.k0;
        const join = (labels: string[], name: string): string => {
          const parts = labels.map((l, i) => `[${l}]setpts=PTS-STARTPTS[${name}_${i}]`);
          graph.push(
            `${parts.join(";")};${labels.map((_, i) => `[${name}_${i}]`).join("")}concat=n=${labels.length}:v=1:a=0,settb=${r.den}/${r.num},setpts=N+${first}[${name}]`,
          );
          return name;
        };
        layerLabel = join(pending.v, `jv${L}`);
        shadowLabel = pending.shadow.length ? join(pending.shadow, `js${L}`) : null;
        pending = { v: [], shadow: [] };
        on = `enable='between(t,${us(head.clip.start - half)},${us(clipEnd(last.clip) - half)})'`;
      }
      if (shadowLabel) {
        graph.push(
          `[${current}][${shadowLabel}]overlay=x=${sAt[0]}:y=${sAt[1]}:eof_action=pass:${on}[os${L}]`,
        );
        current = `os${L}`;
      }
      graph.push(
        `[${current}][${layerLabel}]overlay=x=${at[0]}:y=${at[1]}:eof_action=pass:${on}[${out}]`,
      );
      current = out;
    };

    if (plain) {
      // Opaque and still: one scale converts it straight to the composite's BT.709.
      graph.push(
        `[${src}]${crop}${convert(`${vw}:${vh}`, true)},setsar=1,format=yuv420p,${toLesson}[v${L}]`,
      );
      place(`v${L}`, null, [Math.round(lay.visible.x), Math.round(lay.visible.y)], [0, 0]);
      continue;
    }

    const fmt = rgba ? "rgba" : "yuva420p";
    const fxInput = (a: FxAsset, opts: string[] = []): string => {
      const path = fx(a);
      if (path) {
        const input = addInput(path, opts, true);
        return `${input}:v`;
      }
      const label = `fx${L}_${a.kind}`;
      graph.push(fxGraph(a, rate, label, `fx${L}${a.kind}`));
      return label;
    };
    // Shape, border and shadow are pictures made once (shared/export/fx.ts).
    const shaped = !!(t?.mask || t?.border);
    const R = t?.mask ? maskRadius(t, vw, vh, H) : 0;
    const border = t?.border;
    const bw = border ? (BORDER_WIDTH * H) / 1080 : 0;

    // 1. The picture at its visible size, in the working format.
    const sized = shaped || shadow || !moving;
    let pic = `p${L}`;
    graph.push(
      `[${src}]${crop}${convert(sized ? `${vw}:${vh}` : null, !rgba)},setsar=1,format=${fmt}[${pic}]`,
    );
    // 2. Border ring over the picture (the whole ring shows, as in the preview), then the shape.
    if (border) {
      const ring = fxInput({ kind: "ring", w: vw, h: vh, radius: R, border: bw, color: border });
      const ringIn = rgba ? ring : `rg${L}`;
      if (!rgba) graph.push(`[${ring}]${TO_YUVA}[${ringIn}]`);
      graph.push(`[${pic}][${ringIn}]overlay=0:0:format=auto[rb${L}]`);
      pic = `rb${L}`;
    }
    if (R > 0) {
      const mask = fxInput({ kind: "mask", w: vw, h: vh, radius: R });
      if (alphaContent) {
        graph.push(
          `[${pic}]split[ma${L}][mb${L}];[mb${L}]alphaextract[mc${L}];[mc${L}][${mask}]blend=all_mode=multiply[md${L}];[ma${L}][md${L}]alphamerge[ms${L}]`,
        );
      } else graph.push(`[${pic}][${mask}]alphamerge[ms${L}]`);
      pic = `ms${L}`;
    }
    // 3. Opacity of the layer.
    if (opacity < 1) {
      graph.push(
        `[${pic}]${rgba ? `colorchannelmixer=aa=${n(opacity)}` : `lutyuv=a='val*${n(opacity)}'`}[op${L}]`,
      );
      pic = `op${L}`;
    }
    // 4. Page turn: the right edge folds toward the left one (clip clock), on a transparent border.
    if (page && clip.tail) {
      const d = clip.duration - clip.tail;
      const P = `clip((${frameClock(fps, k0)}-${n(d)})/${n(clip.tail)},0,1)`;
      const a = `(min(${P}*${P}*(3-2*${P}),0.985)*PI/2)`;
      const x = `2+${vw}*cos(${a})`;
      const y = `${n(vh * 0.12)}*sin(${a})`;
      graph.push(
        `[${pic}]pad=${vw + 4}:${vh + 4}:2:2:color=black@0,perspective=x0=2:y0=2:x1='${x}':y1='2+${y}':x2=2:y2=${vh + 2}:x3='${x}':y3='${vh + 2}-${y}':sense=destination:eval=frame:enable='gte(t,${n(d - half)})'[pg${L}]`,
      );
      pic = `pg${L}`;
    }

    // 5. Drop shadow. A still shape casts a shadow made once; a picture with its own changing
    // transparency (cut-out avatar) casts one computed per frame at a quarter of its size.
    let margin = 0;
    let shadowLayer: string | null = null;
    const combined = moving || !!tailMask;
    if (shadow) {
      const k = H / 1080;
      margin = Math.ceil(shadowReach(shadow) * k);
      const { dx, dy } = shadowOffset(shadow);
      const ox = Math.round(dx * k);
      const oy = Math.round(dy * k);
      const sigma = Math.max(0.1, (shadow.blur * k) / 2);
      const cw = vw + 2 * margin;
      const ch = vh + 2 * margin;
      let sh: string;
      if (alphaContent) {
        const q = (v: number): number => Math.max(2, Math.round(v / 4));
        // Offset at a quarter of the size, kept inside the quarter canvas after rounding.
        const at = (offset: number, inner: number, outer: number): number =>
          Math.max(0, Math.min(q(outer) - q(inner), Math.round(offset / 4)));
        const [Y, U, V] = yuv709(shadow.color.slice(0, 7));
        graph.push(
          `[${pic}]split[sp${L}][sq${L}];[sq${L}]alphaextract,scale=${q(vw)}:${q(vh)},pad=${q(cw)}:${q(ch)}:${at(margin + ox, vw, cw)}:${at(margin + oy, vh, ch)}:black,gblur=sigma=${n(Math.max(0.1, sigma / 4))},lut=y='val*${n(shadow.opacity)}',scale=${cw}:${ch},split[sa${L}][sb${L}];` +
            `[sa${L}]format=yuv420p,lutyuv=y=${Y}:u=${U}:v=${V}[sc${L}];[sc${L}][sb${L}]alphamerge${rgba ? `,scale=in_color_matrix=bt709:in_range=tv,format=rgba` : ""}[sd${L}]`,
        );
        pic = `sp${L}`;
        sh = `sd${L}`;
      } else {
        // A shadow the size of its canvas, on the clip's clock (combined) or the timeline.
        const png = fxInput(
          {
            kind: "shadow",
            w: vw,
            h: vh,
            radius: R,
            margin,
            dx: ox,
            dy: oy,
            sigma,
            opacity: shadow.opacity * opacity,
            color: shadow.color.slice(0, 7),
          },
          ["-framerate", rate],
        );
        const clock = combined ? k0 : frameAt(clip.start, r) + k0;
        graph.push(
          `[${png}]${rgba ? "format=rgba" : TO_YUVA},loop=loop=-1:size=1,trim=end_frame=${k1 - k0},settb=${r.den}/${r.num},setpts=N+${clock}[sd${L}]`,
        );
        sh = `sd${L}`;
      }
      if (combined) {
        // Shadow and picture move as one: the picture on the shadow's canvas.
        graph.push(`[${sh}][${pic}]overlay=${margin}:${margin}:format=auto:shortest=1[sh${L}]`);
        pic = `sh${L}`;
      } else if (alphaContent) {
        graph.push(`[${sh}]${toLesson}${fades}[sl${L}]`);
        shadowLayer = `sl${L}`;
      } else {
        graph.push(`[${sh}]null${fades}[sl${L}]`);
        shadowLayer = `sl${L}`;
      }
    }

    // 6. Onto the lesson's clock, the transition mask and the fades.
    const back = rgba ? `,${TO_YUVA}` : "";
    const m = combined ? margin : 0;
    if (!moving) {
      graph.push(`[${pic}]${toLesson}${tailMask}${fades}${back}[v${L}]`);
      const pad = page ? 2 : 0;
      const x = Math.round(lay.visible.x);
      const y = Math.round(lay.visible.y);
      place(`v${L}`, shadowLayer, [x - m - pad, y - m - pad], [x - margin, y - margin]);
    } else {
      // Pop / slide / grow and keyframed movement: size and position follow the same curves as
      // the preview, per frame, around the clip's center.
      let sw = String(vw);
      let shh = String(vh);
      let cx = n(lay.visible.x + lay.visible.w / 2);
      let cy = n(lay.visible.y + lay.visible.h / 2);
      if (kfs) {
        // Size and center at scale 1, then the keyframed scale and position along the clip.
        const one = clipLayout(
          { transform: { ...(clip.transform ?? DEFAULT_TRANSFORM), x: 0.5, y: 0.5, scale: 1 } },
          asset,
          { width: W, height: H },
        );
        const e = keyframeExprs(kfs, `(t-${n(clip.start)})`);
        sw = `${n(one.visible.w)}*(${e.scale})`;
        shh = `${n(one.visible.h)}*(${e.scale})`;
        cx = `(${e.x})*${W}+${n(one.visible.x + one.visible.w / 2 - W / 2)}*(${e.scale})`;
        cy = `(${e.y})*${H}+${n(one.visible.y + one.visible.h / 2 - H / 2)}*(${e.scale})`;
      }
      const size = (v0: string): string => `'max(2,trunc(${v0}*(${motion.scale})/2)*2)'`;
      const grow = margin ? (v: number): string => `*${n((v + 2 * margin) / v)}` : () => "";
      graph.push(
        `[${pic}]${toLesson},scale=w=${size(`(${sw})${grow(vw)}`)}:h=${size(`(${shh})${grow(vh)}`)}:eval=frame,setsar=1${tailMask}${fades}${back}[v${L}]`,
      );
      graph.push(
        `[${current}][v${L}]overlay=x='${cx}+(${motion.dx})*${W}-overlay_w/2':y='${cy}+(${motion.dy})*${H}-overlay_h/2':eval=frame:eof_action=pass:${enable}[${out}]`,
      );
      current = out;
    }
  }

  for (const [i, effect] of (project.cutFx ?? []).entries()) {
    const [a, b] = cutFxWindow(effect);
    if (b < T0 || a > T1) continue;
    graph.push(`[${current}]${cutFxFilter(effect, W, H)}[fx${i}]`);
    current = `fx${i}`;
  }

  // Burned captions go on the final frame (after a vertical layout), drawn by libass in BT.709.
  const ff = (p: string): string => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const subs = spec.assFile
    ? `subtitles=filename='${ff(spec.assFile)}'${spec.fontsDir ? `:fontsdir='${ff(spec.fontsDir)}'` : ""},`
    : "";
  const finish = `${OUTPUT_PARAMS},${subs}setpts=PTS-STARTPTS,format=yuv420p[vout]`;
  if (spec.vertical === "crop") {
    graph.push(
      `[${current}]scale=-2:${spec.height},crop=${spec.width}:${spec.height},setsar=1,${finish}`,
    );
  } else if (spec.vertical === "blur") {
    graph.push(
      `[${current}]split[vfg][vbg];[vbg]scale=${spec.width}:${spec.height}:force_original_aspect_ratio=increase,crop=${spec.width}:${spec.height},boxblur=40:3,eq=brightness=-0.12[vblur];` +
        `[vfg]scale=${spec.width}:-2[vfit];[vblur][vfit]overlay=(W-w)/2:(H-h)/2,setsar=1,${finish}`,
    );
  } else graph.push(`[${current}]${finish}`);

  return {
    inputArgs,
    filter: graph.join(";\n"),
    output: "vout",
    media: [...mediaFiles],
    internal: [...internalFiles],
    frames: win.frames,
    width: spec.vertical ? spec.width : W,
    height: spec.vertical ? spec.height : H,
  };
}
