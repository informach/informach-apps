import {
  ANNOTATION_MOTION,
  ANNOTATION_PRESETS,
  type Annotation,
  type AnnotationKind,
  type BalloonGeometry,
  balloonPath,
  CARD,
  defaultOutline,
  freeBalloonTip,
  MEME,
  outlineStyle,
  preserveBalloonBody,
} from "@shared/annotation";
import {
  DEFAULT_TRANSFORM,
  type Motion,
  type Shadow,
  shadowOffset,
  shadowReach,
  type Transform,
} from "@shared/compose";
import { fontStack } from "@shared/fonts";
import { inPalette } from "@shared/palettes";
import { clipEnd, newId, newTrackName } from "@shared/timeline";
import type { Asset, Clip, Project, Track } from "@shared/types";
import { usePlayback } from "@/state/playback";
import { type Commit, personCommit, trackEdit, useProject } from "@/state/project";
import { ensureFont } from "./fonts";
import { importMedia } from "./importMedia";
import { activePalette, projectFont } from "./palettes";
import { scriptDoc } from "./script";

/** Annotations are drawn at twice the frame resolution, so they stay sharp in a 4K export. */
export const OVERSAMPLE = 2;
const FONT = '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", "Inter Variable", sans-serif';

interface Rendered {
  balloon?: BalloonGeometry;
  bytes: Uint8Array;
  width: number;
  height: number;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > max && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

const isLight = (hex: string): boolean => {
  const v = parseInt(hex.replace("#", ""), 16);
  return ((v >> 16) & 255) * 0.299 + ((v >> 8) & 255) * 0.587 + (v & 255) * 0.114 > 150;
};

/** '#RRGGBB' + opacity as a CSS color. */
const rgba = (hex: string, alpha: number): string => {
  const v = parseInt(hex.replace("#", "").slice(0, 6), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
};

/**
 * Draws an annotation into a tightly sized transparent PNG (k = pixels per 1080p pixel).
 * The shape is drawn first without shadow (outlines always outside the shape, so dashes and
 * widths look the same everywhere); the drop shadow is then cast once by the whole picture.
 */
export async function renderAnnotation(
  a: Annotation,
  frameHeight: number,
  frameWidth = (frameHeight * 16) / 9,
): Promise<Rendered> {
  const k = (frameHeight / 1080) * OVERSAMPLE;
  await document.fonts.load(`700 ${Math.round(40 * k)}px ${FONT}`).catch(() => undefined);
  await ensureFont(a.fontFamily);
  const family = fontStack(a.fontFamily);
  let balloon: BalloonGeometry | undefined;
  const canvas = document.createElement("canvas");
  let ctx = canvas.getContext("2d")!;
  const ol = a.outline ?? defaultOutline(a);
  const olw = Math.max(0, ol.width) * k;
  const pad = 24 * k + olw;
  const font = (size: number, weight = 700): string => `${weight} ${size * k}px ${family}`;
  const ink = a.ink ?? "#12140A";

  // The kind's usual soft shadow, used when the annotation does not choose its own.
  let builtIn: Shadow | null = null;
  const shadow = (blur = 18, y = 6, alpha = 0.35): void => {
    builtIn ??= { distance: y, angle: 90, blur, opacity: alpha, color: "#000000" };
  };
  const size = (w: number, h: number): void => {
    canvas.width = Math.ceil(w);
    canvas.height = Math.ceil(h);
    ctx = canvas.getContext("2d")!;
  };
  const dashKind = outlineStyle(ol);
  /** Dashes or dots along a stroke of width w (dots are round caps on zero-length dashes). */
  const dash = (w: number): void => {
    ctx.setLineDash(
      dashKind === "dashed" ? [w * 2.5, w * 1.8] : dashKind === "dotted" ? [0, w * 2] : [],
    );
    ctx.lineCap = dashKind === "dotted" ? "round" : "butt";
  };
  /**
   * Fills a path with its outline: a solid outline sits outside the shape (a stroke twice as wide,
   * the fill on top); dashes and dots go over the edge so each one stays whole.
   */
  const outlined = (path: Path2D, fill: string): void => {
    ctx.lineJoin = "round";
    ctx.strokeStyle = ol.color;
    if (dashKind === "solid") {
      ctx.lineWidth = olw * 2;
      ctx.stroke(path);
    }
    ctx.fillStyle = fill;
    ctx.fill(path);
    if (dashKind === "dashed" || dashKind === "dotted") {
      ctx.lineWidth = olw;
      dash(olw);
      ctx.stroke(path);
      ctx.setLineDash([]);
      ctx.lineCap = "butt";
    }
  };
  const shapePath = (x: number, y: number, w: number, h: number, rounded: number): Path2D => {
    const p = new Path2D();
    if (a.shape === "ellipse") p.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    else if (a.shape === "triangle") {
      p.moveTo(x + w / 2, y);
      p.lineTo(x + w, y + h);
      p.lineTo(x, y + h);
      p.closePath();
    } else p.roundRect(x, y, w, h, a.shape === "rect" ? 0 : Math.min(rounded, w / 2, h / 2));
    return p;
  };
  let fullFrame = false;

  switch (a.kind) {
    case "arrow":
    case "line": {
      const L = (a.length ?? 200) * k;
      const T = (a.thickness ?? 14) * k;
      const head = (a.headSize ?? (a.thickness ?? 14) * 3) * k;
      // Curve: the middle of the arrow is pushed sideways by up to a third of its length.
      const bend = (a.curve ?? 0) * L * 0.35;
      const style = a.arrowStyle ?? "solid";
      const heads = a.heads ?? (a.kind === "line" ? 0 : 1);
      const one = heads >= 1;
      const two = heads === 2;
      const box = Math.hypot(L + (one ? head : T), Math.abs(bend) * 2 + (one ? head : T)) + pad * 2;
      size(box, box);
      ctx.translate(box / 2, box / 2);
      ctx.rotate(((a.angle ?? 0) * Math.PI) / 180);
      const C: [number, number] = [0, -bend * 2];
      const unit = (x: number, y: number): [number, number] => {
        const d = Math.hypot(x, y) || 1;
        return [x / d, y / d];
      };
      const P1: [number, number] = [L / 2, 0];
      const P0: [number, number] = [-L / 2, 0];
      const d1 = unit(P1[0] - C[0], P1[1] - C[1]);
      const d0 = unit(P0[0] - C[0], P0[1] - C[1]);
      const inset = style === "solid" ? head * 0.85 : head * 0.5;
      const E1: [number, number] = one ? [P1[0] - d1[0] * inset, P1[1] - d1[1] * inset] : P1;
      const E0: [number, number] = two ? [P0[0] - d0[0] * inset, P0[1] - d0[1] * inset] : P0;
      const shaft = new Path2D();
      shaft.moveTo(E0[0], E0[1]);
      shaft.quadraticCurveTo(C[0], C[1], E1[0], E1[1]);
      const headPath = (tip: [number, number], d: [number, number]): Path2D => {
        const nx = -d[1];
        const ny = d[0];
        const w = style === "solid" ? head : head * 0.85;
        const bx = tip[0] - d[0] * head;
        const by = tip[1] - d[1] * head;
        const p = new Path2D();
        p.moveTo(tip[0], tip[1]);
        p.lineTo(bx + (nx * w) / 2, by + (ny * w) / 2);
        // Line arrows get a notched head.
        if (style !== "solid") p.lineTo(bx + d[0] * head * 0.3, by + d[1] * head * 0.3);
        p.lineTo(bx - (nx * w) / 2, by - (ny * w) / 2);
        p.closePath();
        return p;
      };
      const tips = [...(one ? [headPath(P1, d1)] : []), ...(two ? [headPath(P0, d0)] : [])];
      const cap: CanvasLineCap = style === "solid" ? "butt" : "round";
      const shaftDash =
        style === "dashed" ? [T * 1.8, T * 1.4] : style === "dotted" ? [0, T * 1.9] : [];
      ctx.lineJoin = "round";
      if (olw > 0) {
        ctx.strokeStyle = ol.color;
        ctx.fillStyle = ol.color;
        ctx.lineCap = cap;
        ctx.lineWidth = T + olw * 2;
        ctx.setLineDash(shaftDash);
        ctx.stroke(shaft);
        ctx.setLineDash([]);
        ctx.lineWidth = olw * 2;
        for (const h of tips) {
          ctx.fill(h);
          ctx.stroke(h);
        }
      }
      ctx.strokeStyle = a.color;
      ctx.fillStyle = a.color;
      ctx.lineCap = cap;
      ctx.lineWidth = T;
      ctx.setLineDash(shaftDash);
      ctx.stroke(shaft);
      ctx.setLineDash([]);
      for (const h of tips) ctx.fill(h);
      shadow(12, 4);
      break;
    }
    case "balloon":
    case "note":
    case "label": {
      const fs = a.fontSize ?? (a.kind === "label" ? 28 : 30);
      ctx.font = font(fs);
      const maxW = (a.width ?? 420) * k;
      const lines = a.kind === "label" ? [a.text ?? ""] : wrap(ctx, a.text ?? "", maxW);
      const lh = fs * 1.3 * k;
      const tw = Math.max(...lines.map((l) => ctx.measureText(l).width), 20 * k);
      const px = (a.kind === "label" ? 20 : 26) * k;
      const py = (a.kind === "label" ? 12 : 20) * k;
      const bw = tw + px * 2;
      const bh = lines.length * lh + py * 2;
      const free =
        a.kind === "balloon" && a.tailPoint && a.tail !== "none"
          ? freeBalloonTip(a.tailPoint)
          : undefined;
      const tail = free?.tail ?? (a.kind === "balloon" ? (a.tail ?? "bottom-left") : "none");
      const tl = tail === "none" ? 0 : 26 * k;
      const tip = free ? { x: free.point.x * bw, y: free.point.y * bh } : undefined;
      const left = tip ? Math.max(tl, -tip.x) : tl;
      const top = tip ? Math.max(tl, -tip.y) : tl;
      const right = tip ? Math.max(tl, tip.x - bw) : tl;
      const bottom = tip ? Math.max(tl, tip.y - bh) : tl;
      size(bw + pad * 2 + left + right, bh + pad * 2 + top + bottom);
      const x = pad + left;
      const y = pad + top;
      const absoluteTip = tip ? { x: x + tip.x, y: y + tip.y } : undefined;
      if (a.kind === "balloon") {
        const baseX =
          x +
          Math.max(
            16 * k + Math.min(tl * 0.42, (bw - 32 * k) / 5, (bh - 32 * k) / 3),
            Math.min(
              bw - 16 * k - Math.min(tl * 0.42, (bw - 32 * k) / 5, (bh - 32 * k) / 3),
              bw * (tail.endsWith("left") ? 0.28 : 0.72),
            ),
          );
        balloon = {
          x,
          y,
          w: bw,
          h: bh,
          tipX:
            absoluteTip?.x ??
            (tail === "left"
              ? x - tl
              : tail === "right"
                ? x + bw + tl
                : baseX + (tail.endsWith("left") ? -tl * 0.35 : tl * 0.35)),
          tipY:
            absoluteTip?.y ??
            (tail.startsWith("top")
              ? y - tl
              : tail.startsWith("bottom")
                ? y + bh + tl
                : y + bh / 2),
        };
      }
      const r = a.kind === "label" ? bh / 2 : 22 * k;
      const fill = a.kind === "balloon" ? (a.fill ?? "#FFFFFF") : a.color;
      const path =
        a.kind === "balloon"
          ? new Path2D(balloonPath(x, y, bw, bh, 16 * k, tl, tail, absoluteTip))
          : new Path2D();
      if (a.kind !== "balloon") path.roundRect(x, y, bw, bh, r);
      outlined(path, fill);
      if (a.kind === "balloon") shadow(12, 3, 0.2);
      else shadow();
      ctx.fillStyle = isLight(fill) ? ink : "#FFFFFF";
      ctx.font = font(fs);
      ctx.textBaseline = "middle";
      const centered = a.kind === "balloon" && a.layout !== "left";
      ctx.textAlign = centered ? "center" : "left";
      lines.forEach((l, i) => {
        ctx.fillText(l, centered ? x + bw / 2 : x + px, y + py + lh * (i + 0.5));
      });
      break;
    }
    case "title": {
      const fs = a.fontSize ?? 72;
      ctx.font = font(fs, 800);
      const lines = wrap(ctx, a.text ?? "", (a.width ?? 1400) * k);
      const lh = fs * 1.15 * k;
      const tw = Math.max(...lines.map((l) => ctx.measureText(l).width), 20 * k);
      size(tw + pad * 4, lines.length * lh + pad * 4);
      ctx.font = font(fs, 800);
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      // Centered titles (templates) center each line; the others keep a left edge.
      const centered = a.layout === "center";
      ctx.textAlign = centered ? "center" : "left";
      const x = centered ? pad * 2 + tw / 2 : pad * 2;
      lines.forEach((l, i) => {
        const y = pad * 2 + lh * (i + 0.5);
        if (olw > 0) {
          ctx.strokeStyle = ol.color;
          ctx.lineWidth = olw * 2;
          ctx.strokeText(l, x, y);
        }
        ctx.fillStyle = a.color;
        ctx.fillText(l, x, y);
      });
      shadow(24, 6, 0.45);
      break;
    }
    case "highlight": {
      const w = (a.boxWidth ?? 360) * k;
      const h = (a.boxHeight ?? 200) * k;
      size(w + pad * 2, h + pad * 2);
      const path = shapePath(pad, pad, w, h, 18 * k);
      if (a.fill) {
        ctx.globalAlpha = a.fillOpacity ?? 0.25;
        ctx.fillStyle = a.fill;
        ctx.fill(path);
        ctx.globalAlpha = 1;
      }
      // Its usual look is a soft glow in its own color; a chosen shadow replaces it.
      if (a.shadow === undefined) {
        ctx.shadowColor = ol.color;
        ctx.shadowBlur = 16 * k;
      }
      if (olw > 0) {
        ctx.strokeStyle = ol.color;
        ctx.lineWidth = olw;
        ctx.lineJoin = "round";
        dash(olw);
        ctx.stroke(path);
        ctx.setLineDash([]);
        ctx.lineCap = "butt";
      }
      ctx.shadowColor = "transparent";
      break;
    }
    case "card": {
      // Full frame: kicker, big title and subtitle on the left third, with a lime accent bar.
      fullFrame = true;
      const W = frameWidth * OVERSAMPLE;
      size(W, frameHeight * OVERSAMPLE);
      ctx.fillStyle = a.color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const cardInk = isLight(a.color) ? ink : "#FFFFFF";
      const accent = isLight(a.color) ? ink : (a.accent ?? "#C8F031");
      const centered = a.layout === "center";
      const left = centered ? W / 2 : 150 * k;
      ctx.textAlign = centered ? "center" : "left";
      ctx.font = font(a.fontSize ?? 96, 800);
      const lines = wrap(ctx, a.text ?? "", Math.min(W - 300 * k, 1500 * k));
      const lh = (a.fontSize ?? 96) * 1.1 * k;
      // Centered: the whole block sits in the middle of the frame.
      const blockH = (a.kicker ? 40 * k : 0) + lh * lines.length + (a.subtitle ? 82 * k : 0);
      let y = centered ? (canvas.height - blockH) / 2 + 34 * k : 360 * k;
      ctx.fillStyle = accent;
      ctx.fillRect(centered ? left - 45 * k : left, y - 70 * k, 90 * k, 10 * k);
      ctx.textBaseline = "alphabetic";
      if (a.kicker) {
        ctx.font = font(34, 800);
        ctx.fillStyle = accent;
        ctx.fillText(a.kicker.toUpperCase(), left, y);
        y += 40 * k;
      }
      ctx.font = font(a.fontSize ?? 96, 800);
      ctx.fillStyle = cardInk;
      lines.forEach((l, i) => {
        ctx.fillText(l, left, y + lh * (i + 1));
      });
      y += lh * lines.length + 30 * k;
      if (a.subtitle) {
        ctx.font = font(40, 600);
        ctx.globalAlpha = 0.8;
        wrap(ctx, a.subtitle, 1400 * k).forEach((l, i) => {
          ctx.fillText(l, left, y + 52 * k * (i + 1));
        });
        ctx.globalAlpha = 1;
      }
      break;
    }
    case "lowerthird": {
      // Name bar: accent block on the left, name in bold and a lighter line below.
      ctx.font = font(40, 800);
      const nameW = ctx.measureText(a.text ?? "").width;
      ctx.font = font(28, 600);
      const subW = a.subtitle ? ctx.measureText(a.subtitle).width : 0;
      const bar = 14 * k;
      const px = 28 * k;
      const w = Math.max(nameW, subW) + px * 2 + bar;
      const h = (a.subtitle ? 112 : 76) * k;
      size(w + pad * 2, h + pad * 2);
      const path = new Path2D();
      path.rect(pad, pad, w, h);
      outlined(path, rgba(ink, 0.92));
      shadow(20, 6, 0.35);
      ctx.fillStyle = a.color;
      ctx.fillRect(pad, pad, bar, h);
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#FFFFFF";
      ctx.font = font(40, 800);
      ctx.fillText(a.text ?? "", pad + bar + px, pad + 52 * k);
      if (a.subtitle) {
        ctx.fillStyle = a.color;
        ctx.font = font(28, 600);
        ctx.fillText(a.subtitle, pad + bar + px, pad + 92 * k);
      }
      break;
    }
    case "panel": {
      // Background: fills the frame when it is at least the frame's size, otherwise a box.
      if ((a.boxWidth ?? 0) >= 1920 && (a.boxHeight ?? 0) >= 1080) {
        fullFrame = true;
        size(frameWidth * OVERSAMPLE, frameHeight * OVERSAMPLE);
        ctx.fillStyle = a.color;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        break;
      }
      const w = (a.boxWidth ?? 900) * k;
      const h = (a.boxHeight ?? 500) * k;
      size(w + pad * 2, h + pad * 2);
      outlined(shapePath(pad, pad, w, h, 28 * k), a.color);
      shadow();
      break;
    }
    case "step": {
      const d = 76 * k;
      size(d + pad * 2, d + pad * 2);
      const path = new Path2D();
      path.arc(pad + d / 2, pad + d / 2, d / 2, 0, Math.PI * 2);
      outlined(path, a.color);
      shadow(14, 4);
      ctx.fillStyle = isLight(a.color) ? ink : "#FFFFFF";
      ctx.font = font(40, 800);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(a.text ?? "1", pad + d / 2, pad + d / 2 + 2 * k);
      break;
    }
  }

  // Drop shadow cast by the whole picture, with more room around it when it reaches further.
  const s = a.shadow === undefined ? builtIn : a.shadow;
  let out = canvas;
  if (s && s.opacity > 0 && !fullFrame) {
    const { dx, dy } = shadowOffset(s);
    const extra = Math.max(0, Math.ceil(shadowReach(s) * k - pad));
    out = document.createElement("canvas");
    out.width = canvas.width + extra * 2;
    out.height = canvas.height + extra * 2;
    const o = out.getContext("2d")!;
    o.shadowColor = rgba(s.color, s.opacity);
    o.shadowBlur = s.blur * k;
    o.shadowOffsetX = dx * k;
    o.shadowOffsetY = dy * k;
    o.drawImage(canvas, extra, extra);
    if (balloon)
      balloon = {
        ...balloon,
        x: balloon.x + extra,
        y: balloon.y + extra,
        tipX: balloon.tipX + extra,
        tipY: balloon.tipY + extra,
      };
  }

  const blob = await new Promise<Blob>((resolve) => out.toBlob((b) => resolve(b!), "image/png"));
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    width: out.width,
    height: out.height,
    balloon,
  };
}

/** Transform that shows a rendered annotation at its natural size, centered on (x, y). */
export function naturalTransform(
  r: { width: number; height: number },
  frame: Project["settings"],
  x: number,
  y: number,
): Transform {
  // The picture has OVERSAMPLE pixels per frame pixel; scale 1 would fit it to the frame.
  const fit = Math.min(frame.width / r.width, frame.height / r.height);
  return { ...DEFAULT_TRANSFORM, x, y, scale: 1 / (OVERSAMPLE * fit) };
}

/** A free video track above everything shown during [start, end], or a new one on top. */
export function overlayTrack(
  p: Project,
  start: number,
  end: number,
  _purpose?: string,
): { tracks: Track[]; track: Track } {
  const busy = new Set(
    p.clips.filter((c) => c.start < end - 1e-3 && clipEnd(c) > start + 1e-3).map((c) => c.trackId),
  );
  const highestBusy = p.tracks.findIndex((t) => t.kind === "video" && busy.has(t.id));
  const free = p.tracks
    .slice(0, highestBusy < 0 ? p.tracks.length : highestBusy)
    .find((t) => t.kind === "video" && !t.locked);
  if (free) return { tracks: p.tracks, track: free };
  const track: Track = {
    id: newId("t"),
    kind: "video",
    name: newTrackName(p.tracks),
    muted: false,
    hidden: false,
    locked: false,
  };
  return { tracks: [track, ...p.tracks], track };
}

export interface AddOptions {
  at?: number;
  duration?: number;
  x?: number;
  y?: number;
  enter?: Motion;
  exit?: Motion;
}

/** Adds an annotation at the playhead (or `at`) on a free track above the lesson; one undo step. Returns the clip id. */
export async function addAnnotation(
  kind: AnnotationKind,
  changes: Partial<Annotation> = {},
  opts: AddOptions = {},
  commit: Commit = personCommit,
): Promise<string | null> {
  const p = useProject.getState().project;
  if (!p) return null;
  const preset = ANNOTATION_PRESETS.find((x) => x.kind === kind)!;
  // Presets are written in EdiAula's colors; they come in the project's palette.
  const font = projectFont(p, kind);
  const spec: Annotation = {
    ...inPalette(preset.spec, activePalette(p)),
    ...(font ? { fontFamily: font } : {}),
    ...changes,
    kind,
  };
  const r = await renderAnnotation(spec, p.settings.height);
  const path = await window.api.saveGenerated(r.bytes, "png");
  const asset: Asset = {
    id: newId("a"),
    name: preset.label,
    path,
    kind: "image",
    duration: 0,
    width: r.width,
    height: r.height,
    fps: 0,
    hasVideo: true,
    hasAudio: false,
    size: r.bytes.length,
    proxyStatus: "none",
    generated: "annotation",
  };
  const start = Math.max(0, opts.at ?? usePlayback.getState().time);
  const duration = opts.duration ?? preset.duration;
  const id = newId("c");
  commit((q) => {
    const { tracks, track } = overlayTrack(q, start, start + duration);
    const clip: Clip = {
      id,
      assetId: asset.id,
      trackId: track.id,
      start,
      in: 0,
      duration,
      volume: 1,
      annotation: { ...spec, balloonGeometry: r.balloon },
      transform: naturalTransform(
        r,
        q.settings,
        opts.x ?? (kind === "lowerthird" ? 0.06 + r.width / 2 / 2 / q.settings.width : 0.5),
        opts.y ?? (kind === "title" ? 0.2 : kind === "lowerthird" ? 0.68 : 0.42),
      ),
      fadeIn: ANNOTATION_MOTION.enter,
      fadeOut: ANNOTATION_MOTION.exit,
      enter: opts.enter ?? preset.enter,
      exit: opts.exit ?? preset.exit,
    };
    return { ...q, tracks, assets: [...q.assets, asset], clips: [...q.clips, clip] };
  });
  useProject.getState().select([id]);
  return id;
}

/** Redraws of the same clip, one after another, so each starts from the previous result. */
const redraws = new Map<string, Promise<void>>();

/**
 * Redraws an annotation after an edit, keeping where it is and how big it was made. The edit
 * reaches the project only when the picture is ready, so it is tracked (trackEdit) until then:
 * leaving the project waits for it.
 */
export function updateAnnotation(
  clipId: string,
  changes: Partial<Annotation>,
  commit: Commit = personCommit,
): Promise<void> {
  const previous = redraws.get(clipId) ?? Promise.resolve();
  const next = previous.then(() => redrawAnnotation(clipId, changes, commit));
  const settled = next.then(
    () => undefined,
    () => undefined,
  );
  redraws.set(clipId, settled);
  void settled.then(() => {
    if (redraws.get(clipId) === settled) redraws.delete(clipId);
  });
  return trackEdit(next);
}

async function redrawAnnotation(
  clipId: string,
  changes: Partial<Annotation>,
  commit: Commit,
): Promise<void> {
  const p = useProject.getState().project;
  const clip = p?.clips.find((c) => c.id === clipId);
  const asset = clip && p?.assets.find((a) => a.id === clip.assetId);
  if (!p || !clip?.annotation || !asset) return;
  const spec: Annotation = { ...clip.annotation, ...changes };
  const r = await renderAnnotation(spec, p.settings.height, p.settings.width);
  const path = await window.api.saveGenerated(r.bytes, "png");
  const t = clip.transform ?? DEFAULT_TRANSFORM;
  // Same on-screen size per pixel as before: rescale for the new picture's dimensions.
  const adjust = <T extends { x: number; y: number; scale: number }>(value: T): T =>
    preserveBalloonBody(value, asset, r, p.settings, clip.annotation?.balloonGeometry, r.balloon);
  commit((q) => {
    if (q.id !== p.id || q.clips.find((c) => c.id === clipId) !== clip) return q;
    // A copy (pasted or split) shares the picture: it gets its own, so the other one stays as it is.
    const shared = q.clips.some((c) => c.id !== clipId && c.assetId === asset.id);
    const assetId = shared ? newId("a") : asset.id;
    const redrawn = {
      ...asset,
      id: assetId,
      path,
      width: r.width,
      height: r.height,
      size: r.bytes.length,
    };
    return {
      ...q,
      assets: shared
        ? [...q.assets, redrawn]
        : q.assets.map((a) => (a.id === asset.id ? redrawn : a)),
      clips: q.clips.map((c) =>
        c.id === clipId
          ? {
              ...c,
              assetId,
              annotation: { ...spec, balloonGeometry: r.balloon },
              transform: adjust(t),
              keyframes: c.keyframes?.map(adjust),
            }
          : c,
      ),
    };
  });
}

/** A meme or any quick picture: pops in at the side for 2.5 s, on top of the lesson. */
export async function addImageOverlay(
  path: string,
  opts: AddOptions & { placement?: "left" | "right" | "center" } = {},
  commit: Commit = personCommit,
): Promise<string | null> {
  const [asset] = await importMedia([path]);
  const p = useProject.getState().project;
  if (!asset || !p || asset.kind !== "image") return null;
  const start = Math.max(0, opts.at ?? usePlayback.getState().time);
  const duration = opts.duration ?? MEME.duration;
  const placement = opts.placement ?? "left";
  const transform: Transform =
    placement === "center"
      ? { ...MEME.transform, x: 0.5, y: 0.5, scale: 0.55 }
      : placement === "right"
        ? { ...MEME.transform, x: 1 - MEME.transform.x }
        : { ...MEME.transform };
  const id = newId("c");
  commit((q) => {
    const { tracks, track } = overlayTrack(q, start, start + duration, "Memes");
    const clip: Clip = {
      id,
      assetId: asset.id,
      trackId: track.id,
      start,
      in: 0,
      duration,
      volume: 1,
      transform: {
        ...transform,
        ...(opts.x !== undefined ? { x: opts.x } : {}),
        ...(opts.y !== undefined ? { y: opts.y } : {}),
      },
      fadeIn: 0.35,
      fadeOut: 0.25,
      enter: opts.enter ?? MEME.enter,
      exit: opts.exit ?? MEME.exit,
    };
    return { ...q, tracks, clips: [...q.clips, clip] };
  });
  useProject.getState().select([id]);
  return id;
}

/**
 * Opening card at the start (the lesson moves forward to make room) or closing card at the end,
 * filled in from the project and its script.
 */
export async function addCard(
  where: "start" | "end",
  texts: { kicker?: string; text?: string; subtitle?: string; color?: string } = {},
  commit: Commit = personCommit,
): Promise<string | null> {
  const p = useProject.getState().project;
  if (!p) return null;
  const doc = scriptDoc(p);
  const section = doc?.sections[p.script?.section ?? 0];
  const roles = activePalette(p).roles;
  const spec: Annotation = {
    kind: "card",
    color: texts.color ?? roles.dark,
    accent: roles.accent,
    ink: roles.ink,
    ...(projectFont(p, "card") ? { fontFamily: projectFont(p, "card") } : {}),
    kicker: texts.kicker ?? p.course ?? "",
    text:
      texts.text ??
      (where === "start"
        ? (section?.videoTitle ?? p.publish?.title ?? p.name)
        : "Até a próxima aula!"),
    subtitle:
      texts.subtitle ??
      (where === "start"
        ? section
          ? `Seção ${section.number}`
          : undefined
        : p.course
          ? `Continue em ${p.course}`
          : undefined),
  };
  const r = await renderAnnotation(spec, p.settings.height, p.settings.width);
  const path = await window.api.saveGenerated(r.bytes, "png");
  const asset: Asset = {
    id: newId("a"),
    name: where === "start" ? "Abertura" : "Encerramento",
    path,
    kind: "image",
    duration: 0,
    width: r.width,
    height: r.height,
    fps: 0,
    hasVideo: true,
    hasAudio: false,
    size: r.bytes.length,
    proxyStatus: "none",
    generated: "annotation",
  };
  const id = newId("c");
  commit((q) => {
    let clips = q.clips;
    const end = q.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
    const start = where === "start" ? 0 : end;
    if (where === "start") {
      // Everything moves forward by the card's length (locked tracks too: they must stay in sync).
      clips = clips.map((c) => ({ ...c, start: c.start + CARD.duration }));
    }
    const { tracks, track } = overlayTrack({ ...q, clips }, start, start + CARD.duration);
    const clip: Clip = {
      id,
      assetId: asset.id,
      trackId: track.id,
      start,
      in: 0,
      duration: CARD.duration,
      volume: 1,
      annotation: { ...spec, balloonGeometry: r.balloon },
      fadeIn: 0.5,
      fadeOut: 0.5,
      enter: CARD.enter,
      exit: CARD.exit,
    };
    return { ...q, tracks, assets: [...q.assets, asset], clips: [...clips, clip] };
  });
  useProject.getState().select([id]);
  return id;
}
