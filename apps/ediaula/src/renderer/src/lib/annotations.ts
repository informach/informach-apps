import {
  ANNOTATION_MOTION,
  ANNOTATION_PRESETS,
  type Annotation,
  type AnnotationKind,
  BALLOON_TAIL,
  type BalloonGeometry,
  balloonPath,
  balloonTail,
  CARD,
  defaultOutline,
  freeBalloonTip,
  isDrawingKind,
  MEME,
  type Outline,
  outlineStyle,
  preserveBalloonBody,
  textBoxLayout,
} from "@shared/annotation";
import {
  DEFAULT_TRANSFORM,
  type Motion,
  type Shadow,
  shadowOffset,
  shadowReach,
  type Transform,
} from "@shared/compose";
import { dropSpot } from "@shared/dropSpot";
import { fontStack } from "@shared/fonts";
import { inPalette } from "@shared/palettes";
import type { RevealState } from "@shared/reveal";
import { clipEnd, newId, newTrackName } from "@shared/timeline";
import type { Asset, Clip, Project, Track } from "@shared/types";
import { usePlayback } from "@/state/playback";
import { basisOf, type Commit, personCommit, trackEdit, useProject } from "@/state/project";
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

/* ---------- where the texts go: shared by the drawing and by the text typed on the stage ---------- */

/** Sizes every kind is drawn with, for a frame `frameHeight` pixels high. */
interface Sizing {
  /** Picture pixels per 1080p pixel. */
  k: number;
  outline: Outline;
  /** Outline width in picture pixels. */
  olw: number;
  /** Room around the shape (its outline included). */
  pad: number;
  font: (size: number, weight?: number) => string;
  ink: string;
}

function sizing(a: Annotation, frameHeight: number): Sizing {
  const k = (frameHeight / 1080) * OVERSAMPLE;
  const outline = a.outline ?? defaultOutline(a);
  const olw = Math.max(0, outline.width) * k;
  const family = fontStack(a.fontFamily);
  return {
    k,
    outline,
    olw,
    pad: 24 * k + olw,
    font: (size, weight = 700) => `${weight} ${size * k}px ${family}`,
    ink: a.ink ?? "#12140A",
  };
}

let measurer: CanvasRenderingContext2D | null = null;
/** A canvas that only measures text (the drawing measures the same fonts the same way). */
function measuring(font: string): CanvasRenderingContext2D {
  measurer ??= document.createElement("canvas").getContext("2d")!;
  measurer.font = font;
  return measurer;
}
const widest = (ctx: CanvasRenderingContext2D, lines: string[], least: number): number =>
  Math.max(...lines.map((l) => ctx.measureText(l).width), least);

/** Balloon, note and label: the box of text and, for a balloon, its tail. */
function boxGeometry(a: Annotation, s: Sizing) {
  const { k, pad } = s;
  const box = textBoxLayout(a);
  const font = s.font(box.fontSize);
  const ctx = measuring(font);
  const lines = box.wraps ? wrap(ctx, a.text ?? "", box.maxWidth * k) : [a.text ?? ""];
  const lh = box.lineHeight * k;
  const tw = widest(ctx, lines, 20 * k);
  const px = box.padX * k;
  const py = box.padY * k;
  const bw = tw + px * 2;
  const bh = lines.length * lh + py * 2;
  const free =
    a.kind === "balloon" && a.tailPoint && a.tail !== "none"
      ? freeBalloonTip(a.tailPoint)
      : undefined;
  const tail = free?.tail ?? (a.kind === "balloon" ? (a.tail ?? "bottom-left") : "none");
  const tl = tail === "none" ? 0 : BALLOON_TAIL * k;
  const tip = free ? { x: free.point.x * bw, y: free.point.y * bh } : undefined;
  const left = tip ? Math.max(tl, -tip.x) : tl;
  const top = tip ? Math.max(tl, -tip.y) : tl;
  const right = tip ? Math.max(tl, tip.x - bw) : tl;
  const bottom = tip ? Math.max(tl, tip.y - bh) : tl;
  const x = pad + left;
  const y = pad + top;
  return {
    box,
    font,
    lines,
    lh,
    tw,
    px,
    py,
    bw,
    bh,
    tail,
    tl,
    x,
    y,
    absoluteTip: tip ? { x: x + tip.x, y: y + tip.y } : undefined,
    radius: a.kind === "balloon" ? 16 * k : a.kind === "label" ? bh / 2 : 22 * k,
    width: Math.ceil(bw + pad * 2 + left + right),
    height: Math.ceil(bh + pad * 2 + top + bottom),
  };
}

function titleGeometry(a: Annotation, s: Sizing) {
  const { k, pad } = s;
  const fs = a.fontSize ?? 72;
  const font = s.font(fs, 800);
  const ctx = measuring(font);
  const wrapAt = (a.width ?? 1400) * k;
  const lines = wrap(ctx, a.text ?? "", wrapAt);
  const lh = fs * 1.15 * k;
  const tw = widest(ctx, lines, 20 * k);
  return {
    font,
    lines,
    lh,
    tw,
    wrapAt,
    width: Math.ceil(tw + pad * 4),
    height: Math.ceil(lines.length * lh + pad * 4),
  };
}

function lowerthirdGeometry(a: Annotation, s: Sizing) {
  const { k, pad } = s;
  const nameFont = s.font(40, 800);
  const subFont = s.font(28, 600);
  const nameW = measuring(nameFont).measureText(a.text ?? "").width;
  const subW = a.subtitle ? measuring(subFont).measureText(a.subtitle).width : 0;
  const bar = 14 * k;
  const px = 28 * k;
  const w = Math.max(nameW, subW) + px * 2 + bar;
  const h = (a.subtitle ? 112 : 76) * k;
  return {
    nameFont,
    subFont,
    nameW,
    subW,
    bar,
    px,
    w,
    h,
    width: Math.ceil(w + pad * 2),
    height: Math.ceil(h + pad * 2),
  };
}

function cardGeometry(a: Annotation, s: Sizing, frameWidth: number, frameHeight: number) {
  const { k } = s;
  const W = frameWidth * OVERSAMPLE;
  const height = Math.ceil(frameHeight * OVERSAMPLE);
  const centered = a.layout === "center";
  const left = centered ? W / 2 : 150 * k;
  const fs = a.fontSize ?? 96;
  const titleFont = s.font(fs, 800);
  const wrapAt = Math.min(W - 300 * k, 1500 * k);
  const lines = wrap(measuring(titleFont), a.text ?? "", wrapAt);
  const lh = fs * 1.1 * k;
  const subFont = s.font(40, 600);
  const subWrap = 1400 * k;
  const subLines = a.subtitle ? wrap(measuring(subFont), a.subtitle, subWrap) : [];
  // Centered: the whole block sits in the middle of the frame.
  const blockH = (a.kicker ? 40 * k : 0) + lh * lines.length + (a.subtitle ? 82 * k : 0);
  const y0 = centered ? (height - blockH) / 2 + 34 * k : 360 * k;
  const titleY = y0 + (a.kicker ? 40 * k : 0);
  return {
    width: Math.ceil(W),
    height,
    centered,
    left,
    kickerFont: s.font(34, 800),
    titleFont,
    subFont,
    wrapAt,
    subWrap,
    lines,
    subLines,
    lh,
    barY: y0 - 70 * k,
    kickerY: y0,
    /** Title line i sits on titleY + lh·(i+1); subtitle line i on subY + 52k·(i+1). */
    titleY,
    subY: titleY + lh * lines.length + 30 * k,
  };
}

const STEP_SIZE = 76;

/** A text of an annotation where its picture draws it, in pixels of the picture before the shadow's margin. */
export interface TextField {
  key: "text" | "kicker" | "subtitle";
  /** The lines' box: left edge, top of the first line, widest line, line height, how many lines. */
  left: number;
  top: number;
  width: number;
  lineHeight: number;
  lines: number;
  align: "left" | "center";
  font: string;
  color: string;
  /** The width it wraps at (null: one line). */
  wrap: number | null;
  uppercase?: boolean;
  maxLength?: number;
  /** What is behind the text: its box, of this color (absent: nothing, so the picture is hidden while typed). */
  box?: { x: number; y: number; w: number; h: number; radius: number; color: string };
  /** Letters with an outline (titles). */
  stroke?: { color: string; width: number };
}

export interface TextLayout {
  /** The picture without the shadow's margin (the margin is the same on every side). */
  width: number;
  height: number;
  /** The point a redraw keeps still on the screen: the picture's center, a balloon's body center. */
  anchor: { x: number; y: number };
  fields: TextField[];
}

/** Top of a CSS line box of height `lh` whose letters sit where the canvas puts them on `y`. */
function lineTop(font: string, baseline: CanvasTextBaseline, y: number, lh: number): number {
  const ctx = measuring(font);
  ctx.textBaseline = baseline;
  const m = ctx.measureText("Hg");
  ctx.textBaseline = "alphabetic";
  const asc = m.fontBoundingBoxAscent;
  return y - asc - (lh - asc - m.fontBoundingBoxDescent) / 2;
}

/** Fonts an annotation is drawn with, loaded before it is measured or drawn. */
export async function loadAnnotationFonts(
  fontFamily: string | undefined,
  frameHeight: number,
): Promise<void> {
  const k = (frameHeight / 1080) * OVERSAMPLE;
  await document.fonts.load(`700 ${Math.round(40 * k)}px ${FONT}`).catch(() => undefined);
  await ensureFont(fontFamily);
}

/**
 * Where each text of an annotation is drawn (the same numbers renderAnnotation draws with), so it
 * can be typed right over its picture. Null for kinds without text.
 */
export function textLayout(
  a: Annotation,
  frameHeight: number,
  frameWidth: number,
): TextLayout | null {
  const s = sizing(a, frameHeight);
  const { k, pad, ink } = s;
  const center = (width: number, height: number) => ({ x: width / 2, y: height / 2 });
  switch (a.kind) {
    case "balloon":
    case "note":
    case "label": {
      const g = boxGeometry(a, s);
      return {
        width: g.width,
        height: g.height,
        anchor:
          a.kind === "balloon"
            ? { x: g.x + g.bw / 2, y: g.y + g.bh / 2 }
            : center(g.width, g.height),
        fields: [
          {
            key: "text",
            left: g.x + g.px,
            top: lineTop(g.font, "middle", g.y + g.py + g.lh / 2, g.lh),
            width: g.tw,
            lineHeight: g.lh,
            lines: g.lines.length,
            align: g.box.align,
            font: g.font,
            color: g.box.textColor,
            wrap: g.box.wraps ? g.box.maxWidth * k : null,
            box: { x: g.x, y: g.y, w: g.bw, h: g.bh, radius: g.radius, color: g.box.fill },
          },
        ],
      };
    }
    case "title": {
      const g = titleGeometry(a, s);
      return {
        width: g.width,
        height: g.height,
        anchor: center(g.width, g.height),
        fields: [
          {
            key: "text",
            left: pad * 2,
            top: lineTop(g.font, "middle", pad * 2 + g.lh / 2, g.lh),
            width: g.tw,
            lineHeight: g.lh,
            lines: g.lines.length,
            align: a.layout === "center" ? "center" : "left",
            font: g.font,
            color: a.color,
            wrap: g.wrapAt,
            ...(s.olw > 0 ? { stroke: { color: s.outline.color, width: s.olw * 2 } } : {}),
          },
        ],
      };
    }
    case "step": {
      const d = STEP_SIZE * k;
      const font = s.font(40, 800);
      const lh = 48 * k;
      const width = Math.ceil(d + pad * 2);
      return {
        width,
        height: width,
        anchor: center(width, width),
        fields: [
          {
            key: "text",
            left: pad,
            top: lineTop(font, "middle", pad + d / 2 + 2 * k, lh),
            width: d,
            lineHeight: lh,
            lines: 1,
            align: "center",
            font,
            color: isLight(a.color) ? ink : "#FFFFFF",
            wrap: null,
            maxLength: 3,
            box: { x: pad, y: pad, w: d, h: d, radius: d / 2, color: a.color },
          },
        ],
      };
    }
    case "lowerthird": {
      const g = lowerthirdGeometry(a, s);
      const x = pad + g.bar + g.px;
      // The name's part of the bar and, below it, the subtitle's.
      const split = a.subtitle ? 66 * k : g.h;
      const back = rgba(ink, 0.92);
      const boxAt = (y: number, h: number) => ({
        x: pad + g.bar,
        y,
        w: g.w - g.bar,
        h,
        radius: 0,
        color: back,
      });
      const fields: TextField[] = [
        {
          key: "text",
          left: x,
          top: lineTop(g.nameFont, "alphabetic", pad + 52 * k, 50 * k),
          width: Math.max(g.nameW, 20 * k),
          lineHeight: 50 * k,
          lines: 1,
          align: "left",
          font: g.nameFont,
          color: "#FFFFFF",
          wrap: null,
          box: boxAt(pad, split),
        },
      ];
      if (a.subtitle)
        fields.push({
          key: "subtitle",
          left: x,
          top: lineTop(g.subFont, "alphabetic", pad + 92 * k, 36 * k),
          width: Math.max(g.subW, 20 * k),
          lineHeight: 36 * k,
          lines: 1,
          align: "left",
          font: g.subFont,
          color: a.color,
          wrap: null,
          box: boxAt(pad + split, g.h - split),
        });
      return { width: g.width, height: g.height, anchor: center(g.width, g.height), fields };
    }
    case "card": {
      const g = cardGeometry(a, s, frameWidth, frameHeight);
      const cardInk = isLight(a.color) ? ink : "#FFFFFF";
      const accent = isLight(a.color) ? ink : (a.accent ?? "#C8F031");
      const margin = 10 * k;
      /** A text on the card's flat color: the box is that color, a little bigger than the lines. */
      const onCard = (field: Omit<TextField, "left" | "box" | "align">): TextField => {
        const left = g.centered ? g.left - field.width / 2 : g.left;
        return {
          ...field,
          left,
          align: g.centered ? "center" : "left",
          box: {
            x: left - margin,
            y: field.top - margin,
            w: field.width + margin * 2,
            h: field.lineHeight * field.lines + margin * 2,
            radius: 0,
            color: a.color,
          },
        };
      };
      const fields: TextField[] = [];
      if (a.kicker)
        fields.push(
          onCard({
            key: "kicker",
            top: lineTop(g.kickerFont, "alphabetic", g.kickerY, 40 * k),
            width: Math.max(
              measuring(g.kickerFont).measureText(a.kicker.toUpperCase()).width,
              20 * k,
            ),
            lineHeight: 40 * k,
            lines: 1,
            font: g.kickerFont,
            color: accent,
            wrap: null,
            uppercase: true,
          }),
        );
      fields.push(
        onCard({
          key: "text",
          top: lineTop(g.titleFont, "alphabetic", g.titleY + g.lh, g.lh),
          width: widest(measuring(g.titleFont), g.lines, 20 * k),
          lineHeight: g.lh,
          lines: g.lines.length,
          font: g.titleFont,
          color: cardInk,
          wrap: g.wrapAt,
        }),
      );
      if (a.subtitle)
        fields.push(
          onCard({
            key: "subtitle",
            top: lineTop(g.subFont, "alphabetic", g.subY + 52 * k, 52 * k),
            width: widest(measuring(g.subFont), g.subLines, 20 * k),
            lineHeight: 52 * k,
            lines: g.subLines.length,
            font: g.subFont,
            color: isLight(a.color) ? rgba(ink, 0.8) : "rgba(255,255,255,0.8)",
            wrap: g.subWrap,
          }),
        );
      return { width: g.width, height: g.height, anchor: center(g.width, g.height), fields };
    }
    default:
      return null;
  }
}

/**
 * Draws an annotation into a tightly sized transparent PNG (k = pixels per 1080p pixel).
 * The shape is drawn first without shadow (outlines always outside the shape, so dashes and
 * widths look the same everywhere); the drop shadow is then cast once by the whole picture.
 */
export async function renderAnnotation(
  a: Annotation,
  frameHeight: number,
  frameWidth = (frameHeight * 16) / 9,
  reveal?: RevealState | null,
): Promise<Rendered> {
  await loadAnnotationFonts(a.fontFamily, frameHeight);
  const sz = sizing(a, frameHeight);
  const { k, olw, pad, font, ink } = sz;
  const ol = sz.outline;
  let balloon: BalloonGeometry | undefined;
  const canvas = document.createElement("canvas");
  let ctx = canvas.getContext("2d")!;

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
  // Coming in word by word (shared/reveal.ts): the layout is the whole text's, and only the
  // first `budget` words are drawn, each line keeping its place.
  let budget = reveal?.words ?? Number.POSITIVE_INFINITY;
  const say = (line: string, x: number, draw: (text: string, x: number) => void): void => {
    if (budget === Number.POSITIVE_INFINITY) {
      draw(line, x);
      return;
    }
    const words = line.split(/\s+/).filter(Boolean);
    if (budget <= 0 || !words.length) return;
    if (words.length <= budget) {
      budget -= words.length;
      draw(line, x);
      return;
    }
    const part = words.slice(0, budget).join(" ");
    budget = 0;
    const align = ctx.textAlign;
    const full = ctx.measureText(line).width;
    ctx.textAlign = "left";
    draw(part, align === "center" ? x - full / 2 : align === "right" ? x - full : x);
    ctx.textAlign = align;
  };
  /** How much of a stroke shows (an arrow drawing itself), 1 when it is all there. */
  const drawn = reveal?.draw ?? 1;

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
      if (drawn >= 1) {
        shaft.moveTo(E0[0], E0[1]);
        shaft.quadraticCurveTo(C[0], C[1], E1[0], E1[1]);
      } else {
        // The stroke drawn up to `drawn` of its length, from the tail.
        const at = (u: number): [number, number] => [
          (1 - u) * (1 - u) * E0[0] + 2 * (1 - u) * u * C[0] + u * u * E1[0],
          (1 - u) * (1 - u) * E0[1] + 2 * (1 - u) * u * C[1] + u * u * E1[1],
        ];
        const steps = 48;
        const pts = Array.from({ length: steps + 1 }, (_, i) => at(i / steps));
        const lengths = [0];
        for (let i = 1; i < pts.length; i++)
          lengths.push(
            lengths[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]),
          );
        const goal = lengths[steps] * Math.max(0, drawn);
        shaft.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length && lengths[i - 1] < goal; i++) {
          const k = lengths[i] > goal ? (goal - lengths[i - 1]) / (lengths[i] - lengths[i - 1]) : 1;
          shaft.lineTo(
            pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k,
            pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k,
          );
        }
      }
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
      // The head at the tip comes when the stroke gets there; the one at the tail is there already.
      const tips = [
        ...(one && drawn >= 1 ? [headPath(P1, d1)] : []),
        ...(two && drawn > 0 ? [headPath(P0, d0)] : []),
      ];
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
      const g = boxGeometry(a, sz);
      const { box, lines, lh, px, py, bw, bh, tail, tl, x, y, absoluteTip } = g;
      size(g.width, g.height);
      if (a.kind === "balloon") {
        const { tip } =
          tail === "none"
            ? { tip: { x: x + bw / 2, y: y + bh } }
            : balloonTail(x, y, bw, bh, g.radius, tl, tail, absoluteTip);
        balloon = { x, y, w: bw, h: bh, tipX: tip.x, tipY: tip.y };
      }
      const fill = box.fill;
      const path =
        a.kind === "balloon"
          ? new Path2D(balloonPath(x, y, bw, bh, g.radius, tl, tail, absoluteTip))
          : new Path2D();
      if (a.kind !== "balloon") path.roundRect(x, y, bw, bh, g.radius);
      outlined(path, fill);
      if (a.kind === "balloon") shadow(12, 3, 0.2);
      else shadow();
      ctx.fillStyle = box.textColor;
      ctx.font = g.font;
      ctx.textBaseline = "middle";
      const centered = box.align === "center";
      ctx.textAlign = centered ? "center" : "left";
      lines.forEach((l, i) => {
        const ly = y + py + lh * (i + 0.5);
        say(l, centered ? x + bw / 2 : x + px, (t, lx) => ctx.fillText(t, lx, ly));
      });
      break;
    }
    case "title": {
      const { lines, lh, tw, width, height } = titleGeometry(a, sz);
      size(width, height);
      ctx.font = font(a.fontSize ?? 72, 800);
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      // Centered titles (templates) center each line; the others keep a left edge.
      const centered = a.layout === "center";
      ctx.textAlign = centered ? "center" : "left";
      const x = centered ? pad * 2 + tw / 2 : pad * 2;
      lines.forEach((l, i) => {
        const y = pad * 2 + lh * (i + 0.5);
        say(l, x, (t, lx) => {
          if (olw > 0) {
            ctx.strokeStyle = ol.color;
            ctx.lineWidth = olw * 2;
            ctx.strokeText(t, lx, y);
          }
          ctx.fillStyle = a.color;
          ctx.fillText(t, lx, y);
        });
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
      const g = cardGeometry(a, sz, frameWidth, frameHeight);
      size(g.width, g.height);
      ctx.fillStyle = a.color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const cardInk = isLight(a.color) ? ink : "#FFFFFF";
      const accent = isLight(a.color) ? ink : (a.accent ?? "#C8F031");
      const { centered, left, lh } = g;
      ctx.textAlign = centered ? "center" : "left";
      ctx.fillStyle = accent;
      ctx.fillRect(centered ? left - 45 * k : left, g.barY, 90 * k, 10 * k);
      ctx.textBaseline = "alphabetic";
      if (a.kicker) {
        ctx.font = g.kickerFont;
        ctx.fillStyle = accent;
        ctx.fillText(a.kicker.toUpperCase(), left, g.kickerY);
      }
      ctx.font = g.titleFont;
      ctx.fillStyle = cardInk;
      g.lines.forEach((l, i) => {
        say(l, left, (t, lx) => ctx.fillText(t, lx, g.titleY + lh * (i + 1)));
      });
      if (a.subtitle) {
        ctx.font = g.subFont;
        ctx.globalAlpha = 0.8;
        g.subLines.forEach((l, i) => {
          say(l, left, (t, lx) => ctx.fillText(t, lx, g.subY + 52 * k * (i + 1)));
        });
        ctx.globalAlpha = 1;
      }
      break;
    }
    case "lowerthird": {
      // Name bar: accent block on the left, name in bold and a lighter line below.
      const { bar, px, w, h, width, height } = lowerthirdGeometry(a, sz);
      size(width, height);
      const path = new Path2D();
      path.rect(pad, pad, w, h);
      outlined(path, rgba(ink, 0.92));
      shadow(20, 6, 0.35);
      ctx.fillStyle = a.color;
      ctx.fillRect(pad, pad, bar, h);
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#FFFFFF";
      ctx.font = font(40, 800);
      say(a.text ?? "", pad + bar + px, (t, lx) => ctx.fillText(t, lx, pad + 52 * k));
      if (a.subtitle) {
        ctx.fillStyle = a.color;
        ctx.font = font(28, 600);
        say(a.subtitle, pad + bar + px, (t, lx) => ctx.fillText(t, lx, pad + 92 * k));
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
      const d = STEP_SIZE * k;
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

/** A tile of the Anotações panel dragged to the timeline: { kind, spec? } as JSON. */
export const ANNOTATION_MIME = "application/x-ediaula-annotation";

export interface AddOptions {
  at?: number;
  /** Dropped on this track of the timeline: it goes there (shared/dropSpot.ts). */
  trackId?: string;
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
  const p = basisOf(commit);
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
  const wanted = opts.duration ?? preset.duration;
  const id = newId("c");
  commit((q) => {
    // Dropped on a track: there (shortened to the gap, or above a clip it fell on).
    const spot = opts.trackId ? dropSpot(q, opts.trackId, start, wanted) : null;
    const { tracks, track } = spot ?? overlayTrack(q, start, start + wanted);
    const duration = spot?.duration ?? wanted;
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
  // A drawing from the recording is a video of its strokes, not a picture drawn from fields.
  if (isDrawingKind(clip.annotation.kind))
    throw new Error(
      "O desenho feito na gravação não muda de estilo: apague-o ou corte-o como um clipe.",
    );
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
  const p = basisOf(commit);
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
