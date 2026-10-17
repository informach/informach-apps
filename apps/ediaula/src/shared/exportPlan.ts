import { duckExpr, speechSpans } from "./audio.ts";
import {
  BORDER_WIDTH,
  clipLayout,
  DEFAULT_TRANSFORM,
  isMoving,
  maskRadius,
  motionExprs,
  type Shadow,
  shadowOffset,
  shadowReach,
} from "./compose.ts";
import { cursorOverlayExpressions } from "./cursor-expressions.ts";
import { keyframeExprs } from "./keyframes.ts";
import { clipEnd, clipSpeed, projectDuration, sourceEnd, sourceLength } from "./timeline.ts";
import {
  type CutFx,
  colorFxShapes,
  cutFxWindow,
  type DerivedClip,
  foldExprs,
  glitchAmpExpr,
  glitchShiftExpr,
  isMask,
  maskExpr,
  shapeExpr,
  tailProgressExpr,
  withTransitions,
} from "./transitions.ts";
import type { Asset, ExportSpec, Project } from "./types.ts";
import { zoomExprs, zoomsIn } from "./zoom.ts";
import { entryView, zoomLayerFilter } from "./zoomLayer.ts";

export interface ExportPlan {
  /** ffmpeg arguments before the filter graph (inputs). */
  inputArgs: string[];
  /** Contents of the file-backed FFmpeg filter graph. */
  filter: string;
  /** ffmpeg arguments after the filter graph (maps, codecs, output). */
  outputArgs: string[];
  duration: number;
}

const n = (v: number): string => (Math.round(v * 1000) / 1000).toString();

/**
 * Builds the ffmpeg command that renders a project: a black canvas, each visible video clip
 * overlaid from the lowest track to the highest (placed by the shared composition model, the
 * same one the preview uses), and every audible clip mixed together.
 */
/** Gentle broadband noise reduction, after cutting the rumble below the voice. */
export const DENOISE = "highpass=f=80,afftdn=nr=12:nf=-35:tn=1";

/**
 * Drop shadow behind a picture of w × h: a tinted, blurred copy of its alpha, offset, on a canvas
 * with `margin` pixels of room on every side (the picture stays centered, so it is placed at
 * its usual position minus the margin).
 */
export function shadowGraph(
  s: Shadow,
  w: number,
  h: number,
  frameHeight: number,
  id: number,
): { margin: number; graph: (input: string, output: string) => string } {
  const k = frameHeight / 1080;
  const margin = Math.ceil(shadowReach(s) * k);
  const { dx, dy } = shadowOffset(s);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(s.color.slice(i, i + 2), 16));
  const sigma = Math.max(0.1, (s.blur * k) / 2);
  return {
    margin,
    graph: (input, output) =>
      `[${input}]split[shp${id}][sha${id}];` +
      `[sha${id}]lutrgb=r=${r}:g=${g}:b=${b}:a='val*${n(s.opacity)}',pad=${w + 2 * margin}:${h + 2 * margin}:${margin + Math.round(dx * k)}:${margin + Math.round(dy * k)}:color=black@0,gblur=sigma=${n(sigma)}[shb${id}];` +
      `[shb${id}][shp${id}]overlay=${margin}:${margin}:format=auto[${output}]`,
  };
}

/** '#RRGGBB' in the limited-range BT.601 YUV the composite uses. */
function yuv(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return [
    16 + 65.481 * r + 128.553 * g + 24.966 * b,
    128 - 37.797 * r - 74.203 * g + 112 * b,
    128 + 112 * r - 93.786 * g - 18.214 * b,
  ].map((v) => Math.round(v)) as [number, number, number];
}

/**
 * A glitch or a spinning color wipe drawn over the whole composite (W × H) while it lasts.
 * Plane coordinates are scaled to frame pixels, so luma and chroma follow the same shapes.
 */
export function cutFxFilter(fx: CutFx, W: number, H: number): string {
  const [a, b] = cutFxWindow(fx);
  const enable = `enable='between(t,${n(a)},${n(b)})'`;
  if (fx.kind === "glitch") {
    // Blocks jump sideways, thin lines jitter, the colors split (chroma pushed both ways),
    // scanlines darken and some rows flash inverted; strongest at the cut.
    const amp = glitchAmpExpr(fx);
    const r2 = "sin(floor(Y/H*90)*91.7+floor(T*30)*17.3)*43758.5453";
    const jit = `gt((${r2}-floor(${r2})),0.93)*((${r2}-floor(${r2}))-0.965)*0.8*${amp}`;
    const off = `W*(${glitchShiftExpr(amp)}+${jit})`;
    const rf = "sin(floor(T*30)*3.7+floor(Y/H*6)*1.3)*43758.5453";
    const flash = `gt((${rf}-floor(${rf})),0.86)*gt(${amp},0.45)`;
    const at = (dx: string, dy: string): string =>
      `p(clip(X+${off}+${dx},0,W-1),clip(Y+${dy},0,H-1))`;
    const lum = `if(${flash},255-${at("0", "0")},${at("0", "0")})*(1-0.22*${amp}*mod(floor(Y/2),2))`;
    const cb = `if(${flash},256-${at(`0.025*W*${amp}`, `0.012*H*${amp}`)},${at(`0.025*W*${amp}`, `0.012*H*${amp}`)})`;
    const cr = `if(${flash},256-${at(`-0.025*W*${amp}`, `-0.012*H*${amp}`)},${at(`-0.025*W*${amp}`, `-0.012*H*${amp}`)})`;
    return `format=yuv420p,geq=lum='${lum}':cb='${cb}':cr='${cr}':${enable},noise=alls=26:allf=t:${enable}`;
  }
  // Color shapes in frame pixels (plane coordinates scaled), the front one tested first.
  const shapes = colorFxShapes(fx, W, H);
  const inside = shapes.map((sh) => shapeExpr(sh, `(X/W*${W})`, `(Y/H*${H})`));
  const plane = (k: 0 | 1 | 2): string =>
    shapes.reduceRight((rest, sh, i) => `if(${inside[i]},${yuv(sh.color)[k]},${rest})`, "p(X,Y)");
  return `format=yuv420p,geq=lum='${plane(0)}':cb='${plane(1)}':cr='${plane(2)}':${enable}`;
}

export function buildExportPlan(source: Project, spec: ExportSpec): ExportPlan {
  const { fps } = spec;
  // Transitions become fades and dissolve tails, exactly as the preview draws them.
  const project = withTransitions(source);
  const even = (v: number): number => Math.max(2, Math.round(v / 2) * 2);
  // Vertical exports compose the lesson in its own shape first, then fit it into the tall frame.
  const W = spec.vertical
    ? even((spec.width * project.settings.width) / project.settings.height)
    : spec.width;
  const H = spec.vertical ? spec.width : spec.height;
  const audioOnly = !!spec.audioOnly;
  const duration = projectDuration(source);
  const assets = new Map<string, Asset>(project.assets.map((a) => [a.id, a]));
  const trackOrder = new Map(project.tracks.map((t, i) => [t.id, i]));
  const tracks = new Map(project.tracks.map((t) => [t.id, t]));

  const inputArgs: string[] = [];
  const graph: string[] = [];
  const audioLabels: string[] = [];
  const musicLabels: string[] = [];
  let inputIndex = 0;

  // Lowest video layer first: tracks are stored top to bottom, so sort by descending index.
  const clips = [...project.clips]
    .filter((c) => assets.has(c.assetId) && tracks.has(c.trackId))
    .sort(
      (a, b) =>
        trackOrder.get(b.trackId)! - trackOrder.get(a.trackId)! ||
        +!!a.drawAfter - +!!b.drawAfter ||
        a.start - b.start,
    );

  if (!audioOnly)
    graph.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${n(duration)},format=yuv420p[base]`);
  let current = "base";
  let layer = 0;

  for (const clip of clips) {
    const asset = assets.get(clip.assetId)!;
    const track = tracks.get(clip.trackId)!;
    // Zoom layer: everything composed so far (the tracks below it) is zoomed while it lasts.
    if (clip.zoomLayer) {
      if (!audioOnly && !track.hidden) {
        graph.push(
          `[${current}]${zoomLayerFilter(clip, fps, entryView(project, clip))}[zl${layer}]`,
        );
        current = `zl${layer}`;
        layer++;
      }
      continue;
    }
    // Any track can hold pictures (like Camtasia); higher tracks are drawn on top.
    const showVideo = !audioOnly && !track.hidden && asset.kind !== "audio";
    const playAudio = !track.muted && asset.hasAudio && asset.kind !== "image" && clip.volume > 0;
    if (!showVideo && !playAudio) continue;

    // Avatars with the background removed are read from their cached transparent video
    // (libvpx keeps the alpha channel); their sound still comes from the original file.
    const keyed =
      showVideo &&
      asset.kind === "video" &&
      !!asset.key &&
      asset.keyStatus === "ready" &&
      !!asset.keyed;
    let videoIn = -1;
    let audioIn = -1;
    // A sped-up clip reads duration x speed of the source and plays it in duration.
    const speed = clipSpeed(clip);
    const retime = speed === 1 ? "setpts=PTS-STARTPTS" : `setpts=(PTS-STARTPTS)/${n(speed)}`;
    const trim = ["-ss", n(clip.in), "-t", n(clip.duration * speed)];
    if (asset.kind === "image") {
      videoIn = inputIndex++;
      inputArgs.push(
        "-loop",
        "1",
        "-framerate",
        String(fps),
        "-t",
        n(clip.duration),
        "-i",
        asset.path,
      );
    } else if (keyed) {
      videoIn = inputIndex++;
      inputArgs.push("-c:v", "libvpx-vp9", ...trim, "-i", asset.keyed!);
      if (playAudio) {
        audioIn = inputIndex++;
        inputArgs.push(...trim, "-i", asset.path);
      }
    } else {
      videoIn = audioIn = inputIndex++;
      inputArgs.push(...trim, "-i", asset.path);
    }

    if (showVideo) {
      const lay = clipLayout(clip, asset, { width: W, height: H });
      const vw = Math.round(lay.visible.w);
      const vh = Math.round(lay.visible.h);
      if (vw >= 2 && vh >= 2) {
        const v = `v${layer}`;
        const c = lay.crop;
        const crop =
          c.left || c.top || c.right || c.bottom
            ? `crop=iw*${n(1 - c.left - c.right)}:ih*${n(1 - c.top - c.bottom)}:iw*${n(c.left)}:ih*${n(c.top)},`
            : "";
        const opacity = lay.opacity < 1 ? `,colorchannelmixer=aa=${n(lay.opacity)}` : "";
        const end = clipEnd(clip);
        const motion = motionExprs(clip);
        const fades = motion.fades
          .map((f) => `,fade=t=${f.kind}:st=${n(f.start)}:d=${n(f.duration)}:alpha=1`)
          .join("");
        // Source picture first (pointer drawn on it, then zoomed), then crop, size and placement.
        let src = `src${layer}`;
        const dc = clip as DerivedClip;
        const short =
          dc.tail && asset.kind === "video" ? (sourceEnd(clip) - sourceLength(asset)) / speed : 0;
        // Extend the decoded source before fps normalizes EOF. Pad in source
        // seconds so retiming also scales the held frames with the clip.
        const hold =
          short > 0.01 ? `tpad=stop_mode=clone:stop_duration=${n((short + 0.1) * speed)},` : "";
        graph.push(
          speed === 1
            ? `[${videoIn}:v]${hold}fps=${fps},${retime}[${src}]`
            : `[${videoIn}:v]${hold}${retime},fps=${fps}[${src}]`,
        );
        const cursor = asset.cursor ? spec.cursors?.[asset.id] : undefined;
        if (cursor) {
          const ci = inputIndex++;
          inputArgs.push("-c:v", "libvpx-vp9", ...trim, "-i", cursor.sprite);
          const name = `overlay@k${layer}`;
          const coordinates = cursorOverlayExpressions(cursor, clip, fps);
          graph.push(
            speed === 1
              ? `[${ci}:v]fps=${fps},${retime}[spr${layer}]`
              : `[${ci}:v]${retime},fps=${fps}[spr${layer}]`,
          );
          graph.push(
            `[${src}][spr${layer}]${name}=x='${coordinates.x}':y='${coordinates.y}':eval=frame:eof_action=pass[cur${layer}]`,
          );
          src = `cur${layer}`;
        }
        // The media's zooms over what this clip (and its transition tail) plays.
        const zooms = zoomsIn(asset.zooms, clip.in, sourceEnd(clip));
        if (zooms.length) {
          // The view at source time in + frame/fps x speed, warped to fill the frame (smooth, sub-pixel).
          const e = zoomExprs(
            zooms,
            `(${n(clip.in)}+in${speed === 1 ? "" : `*${n(speed)}`}/${fps})`,
          );
          const x0 = `(${e.cx}-0.5/${e.scale})*W`;
          const y0 = `(${e.cy}-0.5/${e.scale})*H`;
          const w = `W/${e.scale}`;
          const h = `H/${e.scale}`;
          graph.push(
            `[${src}]perspective=x0='${x0}':y0='${y0}':x1='${x0}+${w}':y1='${y0}':x2='${x0}':y2='${y0}+${h}':x3='${x0}+${w}':y3='${y0}+${h}':eval=frame:interpolation=linear[zm${layer}]`,
          );
          src = `zm${layer}`;
        }
        const out = `o${layer}`;
        const enable = `enable='between(t,${n(clip.start)},${n(end)})'`;
        // Rounded corners / circle and border, at the visible size, as the alpha of each pixel.
        const t = clip.transform;
        let shape = "";
        if (t?.mask || t?.border) {
          const R = maskRadius(t, vw, vh, H);
          const bw = t.border ? (BORDER_WIDTH * H) / 1080 : 0;
          const d = `hypot(max(abs(X-W/2)-(W/2-${n(R)}),0),max(abs(Y-H/2)-(H/2-${n(R)}),0))`;
          const inside = R > 0 ? `clip(${n(R)}-${d}+0.5,0,1)` : "1";
          const content =
            bw > 0
              ? R > 0
                ? `clip(${n(R - bw)}-${d}+0.5,0,1)`
                : `(gte(X,${n(bw)})*gte(Y,${n(bw)})*lt(X,W-${n(bw)})*lt(Y,H-${n(bw)}))`
              : "1";
          const [br, bg, bb] = t.border
            ? [1, 3, 5].map((i) => parseInt(t.border!.slice(i, i + 2), 16))
            : [0, 0, 0];
          const mix = (c: string, v: number): string =>
            bw > 0 ? `${c}(X,Y)*${content}+${v}*(1-${content})` : `${c}(X,Y)`;
          shape = `,geq=r='${mix("r", br)}':g='${mix("g", bg)}':b='${mix("b", bb)}':a='alpha(X,Y)*${inside}'`;
        }
        const kfs = clip.keyframes?.length ? clip.keyframes : undefined;
        const tailStart = dc.tail ? clip.start + clip.duration - dc.tail : 0;
        const tailWindow = `enable='between(t,${n(tailStart)},${n(end)})'`;
        const fold = dc.tailFx === "fold" ? foldExprs(tailProgressExpr(dc)) : null;
        const mask = isMask(dc.tailFx)
          ? `,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*${maskExpr(dc.tailFx, tailProgressExpr(dc))}':${tailWindow}`
          : fold
            ? `,geq=r='${fold.r}':g='${fold.g}':b='${fold.b}':a='${fold.a}':${tailWindow}`
            : "";
        // Drop shadow: the picture is centered on a larger canvas with its shadow behind it.
        const sh =
          t?.shadow && t.shadow.opacity > 0 ? shadowGraph(t.shadow, vw, vh, H, layer) : null;
        // Page turn: the right edge folds toward the left one. A transparent border first, so the
        // area the page uncovers is transparent (the warp repeats the edge pixels).
        const page =
          dc.tailFx === "page" && !sh
            ? (() => {
                const P = `clip((in/${fps}-${n(clip.duration - dc.tail!)})/${n(dc.tail!)},0,1)`;
                const a = `(min(${P}*${P}*(3-2*${P}),0.985)*PI/2)`;
                const x = `2+${vw}*cos(${a})`;
                const y = `${n(vh * 0.12)}*sin(${a})`;
                return `,pad=${vw + 4}:${vh + 4}:2:2:color=black@0,perspective=x0=2:y0=2:x1='${x}':y1='2+${y}':x2=2:y2=${vh + 2}:x3='${x}':y3='${vh + 2}-${y}':sense=destination:eval=frame:enable='gte(t,${n(clip.duration - dc.tail!)})'`;
              })()
            : "";
        if (!isMoving(clip) && !kfs) {
          if (sh) {
            graph.push(
              `[${src}]${crop}scale=${vw}:${vh},setsar=1,format=rgba${shape}${opacity}[pre${layer}]`,
            );
            graph.push(sh.graph(`pre${layer}`, `shd${layer}`));
            graph.push(`[shd${layer}]setpts=PTS+${n(clip.start)}/TB${mask}${fades}[${v}]`);
          } else
            graph.push(
              `[${src}]${crop}scale=${vw}:${vh},setsar=1,format=rgba${shape}${opacity}${page},setpts=PTS+${n(clip.start)}/TB${mask}${fades}[${v}]`,
            );
          const m = (sh?.margin ?? 0) + (page ? 2 : 0);
          graph.push(
            `[${current}][${v}]overlay=x=${Math.round(lay.visible.x) - m}:y=${Math.round(lay.visible.y) - m}:eof_action=pass:${enable}[${out}]`,
          );
        } else {
          // Pop / slide / grow and keyframed movement: size and position follow the same curves as
          // the preview, per frame, around the clip's center.
          let sw = String(vw);
          let sh_ = String(vh);
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
            sh_ = `${n(one.visible.h)}*(${e.scale})`;
            cx = `(${e.x})*${W}+${n(one.visible.x + one.visible.w / 2 - W / 2)}*(${e.scale})`;
            cy = `(${e.y})*${H}+${n(one.visible.y + one.visible.h / 2 - H / 2)}*(${e.scale})`;
          }
          const size = (v0: string): string => `'max(2,trunc(${v0}*(${motion.scale})/2)*2)'`;
          if (sh) {
            // The shadow is made at the visible size, then grows and moves with the picture.
            graph.push(
              `[${src}]${crop}scale=${vw}:${vh},setsar=1,format=rgba${shape}${opacity}[pre${layer}]`,
            );
            graph.push(sh.graph(`pre${layer}`, `shd${layer}`));
            graph.push(
              `[shd${layer}]setpts=PTS+${n(clip.start)}/TB,scale=w=${size(`(${sw})*${n((vw + 2 * sh.margin) / vw)}`)}:h=${size(`(${sh_})*${n((vh + 2 * sh.margin) / vh)}`)}:eval=frame,setsar=1${mask}${fades}[${v}]`,
            );
          } else {
            const shaped = shape ? `scale=${vw}:${vh},format=rgba${shape},` : "";
            graph.push(
              `[${src}]${crop}${shaped}format=rgba${opacity},setpts=PTS+${n(clip.start)}/TB,scale=w=${size(sw)}:h=${size(sh_)}:eval=frame,setsar=1${mask}${fades}[${v}]`,
            );
          }
          graph.push(
            `[${current}][${v}]overlay=x='${cx}+(${motion.dx})*${W}-overlay_w/2':y='${cy}+(${motion.dy})*${H}-overlay_h/2':eval=frame:eof_action=pass:${enable}[${out}]`,
          );
        }
        current = out;
        layer++;
      }
    }

    if (playAudio) {
      const a = `a${audioLabels.length + musicLabels.length}`;
      const delay = Math.round(clip.start * 1000);
      graph.push(
        `[${audioIn}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,${clip.denoise ? `${DENOISE},` : ""}` +
          `${atempo(speed)}volume=${n(clip.volume)}${clip.tail ? `,atrim=0:${n(clip.duration - clip.tail)}` : ""},adelay=${delay}:all=1[${a}]`,
      );
      (track.music ? musicLabels : audioLabels).push(a);
    }
  }

  if (!audioOnly)
    for (const [i, fx] of (project.cutFx ?? []).entries()) {
      graph.push(`[${current}]${cutFxFilter(fx, W, H)}[fx${i}]`);
      current = `fx${i}`;
    }

  // Burned captions go on the final frame (after a vertical layout), drawn by libass.
  const ff = (p: string): string => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const subs = spec.assFile
    ? `subtitles=filename='${ff(spec.assFile)}'${spec.fontsDir ? `:fontsdir='${ff(spec.fontsDir)}'` : ""},`
    : "";
  if (audioOnly) {
    // nothing to draw
  } else if (spec.vertical === "crop") {
    graph.push(
      `[${current}]scale=-2:${spec.height},crop=${spec.width}:${spec.height},setsar=1,${subs}format=yuv420p[vout]`,
    );
  } else if (spec.vertical === "blur") {
    graph.push(
      `[${current}]split[vfg][vbg];[vbg]scale=${spec.width}:${spec.height}:force_original_aspect_ratio=increase,crop=${spec.width}:${spec.height},boxblur=40:3,eq=brightness=-0.12[vblur];` +
        `[vfg]scale=${spec.width}:-2[vfit];[vblur][vfit]overlay=(W-w)/2:(H-h)/2,setsar=1,${subs}format=yuv420p[vout]`,
    );
  } else graph.push(`[${current}]${subs}format=yuv420p[vout]`);

  const mixOf = (labels: string[]): string =>
    labels.length === 1
      ? `[${labels[0]}]anull`
      : `${labels.map((l) => `[${l}]`).join("")}amix=inputs=${labels.length}:normalize=0:duration=longest`;
  const loud = spec.normalizeLoudness ? ",loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000" : "";
  if (audioLabels.length === 0 && musicLabels.length === 0) {
    graph.push(`anullsrc=r=48000:cl=stereo,atrim=0:${n(duration)}[aout]`);
  } else if (musicLabels.length === 0) {
    graph.push(`${mixOf(audioLabels)}${loud},apad=whole_dur=${n(duration)}[aout]`);
  } else {
    // Music ducking: the music follows an envelope that drops while anyone speaks (same curve as the preview).
    const duck = duckExpr(spec.speech ?? speechSpans(project));
    const music = `${mixOf(musicLabels)}${duck === "1" ? "" : `,volume='${duck}':eval=frame`}`;
    if (audioLabels.length === 0) graph.push(`${music}${loud},apad=whole_dur=${n(duration)}[aout]`);
    else {
      graph.push(`${music}[ducked]`);
      graph.push(`${mixOf(audioLabels)}[voice]`);
      graph.push(
        `[voice][ducked]amix=inputs=2:normalize=0:duration=longest${loud},apad=whole_dur=${n(duration)}[aout]`,
      );
    }
  }

  const kbps = Math.round(spec.videoBitrate);
  const video =
    spec.encoder === "nvenc"
      ? [
          "-c:v",
          "h264_nvenc",
          "-preset",
          "p5",
          "-rc",
          "vbr",
          "-b:v",
          `${kbps}k`,
          "-maxrate",
          `${Math.round(kbps * 1.5)}k`,
          "-bufsize",
          `${kbps * 2}k`,
          "-profile:v",
          "high",
        ]
      : [
          "-c:v",
          "libx264",
          "-preset",
          "medium",
          "-b:v",
          `${kbps}k`,
          "-maxrate",
          `${Math.round(kbps * 1.5)}k`,
          "-bufsize",
          `${kbps * 2}k`,
          "-profile:v",
          "high",
        ];

  if (audioOnly)
    return {
      inputArgs,
      filter: graph.join(";\n"),
      outputArgs: [
        "-map",
        "[aout]",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-t",
        n(duration),
        spec.outPath,
      ],
      duration,
    };

  const outputArgs = [
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    ...video,
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(fps),
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-t",
    n(duration),
    "-movflags",
    "+faststart",
    spec.outPath,
  ];

  return { inputArgs, filter: graph.join(";\n"), outputArgs, duration };
}

/** Tempo change keeping the pitch: atempo takes 0.5 to 2, so larger changes chain several. */
export function atempo(speed: number): string {
  if (Math.abs(speed - 1) < 1e-3) return "";
  const parts: number[] = [];
  let s = speed;
  while (s > 2) {
    parts.push(2);
    s /= 2;
  }
  while (s < 0.5) {
    parts.push(0.5);
    s /= 0.5;
  }
  parts.push(s);
  return parts.map((p) => `atempo=${n(p)},`).join("");
}
