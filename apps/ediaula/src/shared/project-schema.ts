import { z } from "zod";
import { PROPOSAL_ITEM_LIMIT } from "./anchors.ts";
import { ENCODERS, type ExportSpec, type Project } from "./types.ts";

const number = z.number().min(-1e9).max(1e9);
const time = z
  .number()
  .min(0)
  .max(7 * 86400);
/** Seconds relative to a clip's start: a piece of a moving clip keeps the keyframe just before it. */
const offset = z
  .number()
  .min(-7 * 86400)
  .max(7 * 86400);
const text = z.string().max(1024 * 1024);
const id = z.string().min(1).max(200);
const path = z
  .string()
  .max(32768)
  .refine((value) => !value.includes("\0"));
const color = z.string().regex(/^#(?:[\da-f]{6}|[\da-f]{8})$/i);
const point = z.looseObject({ x: number, y: number });
const shadow = z.looseObject({
  distance: number,
  angle: number,
  blur: number.nonnegative(),
  opacity: number.min(0).max(1),
  color,
});
const motion = z.enum([
  "fade",
  "pop",
  "grow",
  "slide-up",
  "slide-down",
  "slide-left",
  "slide-right",
  "push-left",
  "push-right",
  "zoom",
]);
const chroma = z.looseObject({
  color,
  threshold: number,
  softness: number.nonnegative(),
  despill: number,
  choke: number,
});
const cursorPoint = z.looseObject({
  t: time,
  x: number,
  y: number,
  inHandle: point.optional(),
  outHandle: point.optional(),
});
const cursorPoints = z.array(cursorPoint).max(20000);
const cursorFx = z.looseObject({
  path: cursorPoints.optional(),
  pathEdits: z
    .array(z.looseObject({ start: time, end: time, points: cursorPoints }))
    .max(20000)
    .optional(),
  size: number.positive(),
  smooth: number,
  clicks: z.boolean(),
  halo: z.boolean(),
  hideIdle: z.boolean(),
  hidden: z.boolean().optional(),
  keys: z.boolean().optional(),
});
const annotation = z.looseObject({
  kind: z.enum([
    "arrow",
    "balloon",
    "note",
    "label",
    "title",
    "highlight",
    "step",
    "card",
    "lowerthird",
    "panel",
    "line",
  ]),
  text: text.optional(),
  color,
  angle: number.optional(),
  length: number.optional(),
  width: number.optional(),
  fontSize: number.optional(),
  tail: z
    .enum(["none", "bottom-left", "bottom-right", "top-left", "top-right", "left", "right"])
    .optional(),
  tailPoint: point.optional(),
  balloonGeometry: z
    .looseObject({ x: number, y: number, w: number, h: number, tipX: number, tipY: number })
    .optional(),
  boxWidth: number.optional(),
  boxHeight: number.optional(),
  kicker: text.optional(),
  subtitle: text.optional(),
  layout: z.enum(["left", "center"]).optional(),
  fontFamily: text.optional(),
  outline: z
    .looseObject({
      color,
      width: number.nonnegative(),
      dash: z.union([z.boolean(), z.enum(["dashed", "dotted"])]).optional(),
    })
    .optional(),
  shadow: shadow.nullable().optional(),
  thickness: number.optional(),
  headSize: number.optional(),
  arrowStyle: z.enum(["solid", "line", "dashed", "dotted"]).optional(),
  heads: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  curve: number.optional(),
  shape: z.enum(["rounded", "rect", "ellipse", "triangle"]).optional(),
  fill: color.optional(),
  fillOpacity: number.optional(),
  ink: color.optional(),
  accent: color.optional(),
});
const zooms = z
  .array(
    z.looseObject({
      id,
      start: time,
      end: time,
      scale: number.positive(),
      focus: z.array(z.looseObject({ t: time, x: number, y: number })).max(20000),
      auto: z.boolean().optional(),
      ease: time.optional(),
    }),
  )
  .max(20000);
const asset = z.looseObject({
  id,
  name: text,
  path,
  kind: z.enum(["video", "audio", "image"]),
  duration: time,
  width: number.nonnegative(),
  height: number.nonnegative(),
  fps: number.nonnegative(),
  hasVideo: z.boolean(),
  hasAudio: z.boolean(),
  size: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER),
  thumb: path.optional(),
  waveform: path.optional(),
  proxy: path.optional(),
  proxyStatus: z.enum(["none", "pending", "ready", "error"]),
  missing: z.boolean().optional(),
  transcript: path.optional(),
  transcriptStatus: z.enum(["pending", "ready", "error"]).optional(),
  vfr: z.boolean().optional(),
  generated: z.enum(["annotation", "effect"]).optional(),
  cursor: path.optional(),
  cursorMissing: z.boolean().optional(),
  cursorFx: cursorFx.optional(),
  zooms: zooms.optional(),
  markers: z
    .array(z.looseObject({ t: time, kind: z.enum(["marker", "retake"]) }))
    .max(20000)
    .optional(),
  screen: color.optional(),
  key: chroma.optional(),
  keyed: path.optional(),
  keyedId: id.optional(),
  keyStatus: z.enum(["pending", "ready", "error"]).optional(),
});
const track = z.looseObject({
  id,
  kind: z.enum(["video", "audio"]),
  name: text,
  muted: z.boolean(),
  hidden: z.boolean(),
  locked: z.boolean(),
  music: z.boolean().optional(),
  height: number.positive().optional(),
});
const transform = z.looseObject({
  x: number,
  y: number,
  scale: number.positive(),
  opacity: number.min(0).max(1),
  crop: z.looseObject({ left: number, top: number, right: number, bottom: number }).optional(),
  mask: z.enum(["rounded", "circle"]).optional(),
  border: color.optional(),
  shadow: shadow.optional(),
});
const clip = z.looseObject({
  id,
  assetId: id,
  trackId: id,
  start: time,
  in: time,
  duration: time,
  volume: number.nonnegative(),
  speed: number.positive().optional(),
  denoise: z.boolean().optional(),
  transform: transform.optional(),
  fadeIn: time.optional(),
  fadeOut: time.optional(),
  enter: motion.optional(),
  exit: motion.optional(),
  keyframes: z
    .array(z.looseObject({ t: offset, x: number, y: number, scale: number.positive() }))
    .max(20000)
    .optional(),
  transition: z
    .looseObject({
      kind: z.enum([
        "dissolve",
        "black",
        "wipe-right",
        "wipe-left",
        "wipe-up",
        "wipe-down",
        "circle-open",
        "circle-close",
        "clock",
        "slide",
        "zoom",
        "page",
        "fold",
        "glitch",
        "colorwipe",
        "colorbars",
        "colorcircles",
        "colorpanels",
        "colorsplit",
      ]),
      duration: time,
      colors: z.array(color).max(20).optional(),
    })
    .optional(),
  annotation: annotation.optional(),
  // Older projects kept the zooms on each clip; opening moves them to the media.
  zooms: zooms.optional(),
  zoomLayer: z
    .looseObject({
      scale: number.positive(),
      x: number,
      y: number,
      zoomIn: z.boolean().optional(),
      zoomOut: z.boolean().optional(),
      easeIn: time.optional(),
      easeOut: time.optional(),
      ease: time.optional(),
      origin: time.optional(),
      length: number.positive().optional(),
    })
    .optional(),
  insertId: id.optional(),
});
export const projectSettingsSchema = z.looseObject({
  width: z.int().min(2).max(16384),
  height: z.int().min(2).max(16384),
  fps: z.number().positive().max(240),
});
const sourceSpan = z.looseObject({
  clipId: id,
  assetId: id,
  trackId: id.optional(),
  start: time,
  end: time,
  at: time.optional(),
  until: time.optional(),
});
const proposal = z.looseObject({
  id,
  projectId: id,
  title: text,
  revision: z.int().nonnegative(),
  createdAt: z.number().nonnegative(),
  items: z
    .array(
      z.looseObject({
        id,
        start: time,
        end: time,
        reason: text,
        text: text.optional(),
        near: number.optional(),
        anchors: z.array(sourceSpan).max(256),
        wordKeys: z.array(z.string().max(300)).max(5000).optional(),
        status: z.enum(["pending", "rejected"]),
      }),
    )
    .max(PROPOSAL_ITEM_LIMIT),
});

/** Preserve extension fields of the versioned format; all fields used by the editor are validated. */
export const projectSchema = z
  .looseObject({
    version: z.literal(1),
    id,
    name: text,
    course: text.optional(),
    createdAt: z.number().nonnegative(),
    updatedAt: z.number().nonnegative(),
    exportedAt: z.number().nonnegative().optional(),
    publish: z
      .looseObject({
        title: text.optional(),
        description: text.optional(),
        summary: text.optional(),
        chapters: z
          .array(z.looseObject({ time, title: text }))
          .max(20000)
          .optional(),
      })
      .optional(),
    protected: z
      .array(z.looseObject({ id, assetId: id, start: time, end: time, label: text }))
      .max(20000)
      .optional(),
    captions: z
      .looseObject({
        look: z.enum(["box", "outline", "karaoke"]),
        position: z.enum(["bottom", "middle", "top"]),
        size: number.positive(),
        font: text.optional(),
        highlight: color.optional(),
        burn: z.boolean(),
      })
      .optional(),
    palette: id.optional(),
    paletteFonts: z.boolean().optional(),
    script: z.looseObject({ text, section: z.int().nonnegative().optional() }).optional(),
    stats: z.looseObject({ editSeconds: z.number().nonnegative() }).optional(),
    // Pending AI proposals, at most PROPOSAL_ITEM_LIMIT items in all (the save is one IPC value).
    proposals: z
      .array(proposal)
      .max(20)
      .refine(
        (list) => list.reduce((n, p) => n + p.items.length, 0) <= PROPOSAL_ITEM_LIMIT,
        "Too many proposal items",
      )
      .optional(),
    settings: projectSettingsSchema,
    assets: z.array(asset).max(5000),
    tracks: z.array(track).max(256),
    clips: z.array(clip).max(20000),
  })
  .refine(
    (project) =>
      [project.assets, project.tracks, project.clips].every(
        (items) => new Set(items.map((item) => item.id)).size === items.length,
      ),
    "Duplicate project identifiers",
  ) satisfies z.ZodType<Project>;

/** Renderer may not supply native filter-script or font-directory paths. */
export const exportSpecSchema = z.strictObject({
  outPath: path.min(1),
  width: z.int().min(2).max(16384),
  height: z.int().min(2).max(16384),
  fps: z.number().positive().max(240),
  videoBitrate: z.number().positive().max(1000000),
  normalizeLoudness: z.boolean(),
  encoder: z.enum(ENCODERS),
  speech: z
    .array(z.tuple([time, time]))
    .max(20000)
    .optional(),
  captions: text.optional(),
  thumbnail: z.boolean().optional(),
  burnAss: text.optional(),
  audioOnly: z.boolean().optional(),
  vertical: z.enum(["blur", "crop"]).optional(),
  cursors: z
    .record(
      id,
      z.strictObject({
        sprite: path.min(1),
        size: z.number().positive().max(16384),
        fps: z.number().positive().max(240),
        // Two coordinates per source frame of the whole recording: one IPC value, any length.
        positions: z
          .instanceof(Int32Array)
          .refine(
            (values) => values.length % 2 === 0 && values.length <= 4_000_000,
            "Invalid cursor positions",
          ),
      }),
    )
    .optional(),
}) satisfies z.ZodType<ExportSpec>;
