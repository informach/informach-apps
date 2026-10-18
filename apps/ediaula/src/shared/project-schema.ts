import { z } from "zod";
import {
  CUT_CATEGORIES,
  MAX_ANCHORS,
  MAX_WORD_KEYS,
  PROPOSAL_ITEM_LIMIT,
  PROPOSAL_LIMIT,
} from "./anchors.ts";
import { PREPARE_DECISIONS, PREPARE_STEPS } from "./prepare.ts";
import { REVIEWED_LIMIT } from "./seams.ts";
import {
  ENCODERS,
  EXPORT_QUALITIES,
  type ExportSpec,
  type Project,
  RECORDING_ROLES,
} from "./types.ts";
import { VOICE_PRESETS } from "./voiceChain.ts";
import { VOICE_MASTER_LIMIT } from "./voiceMaster.ts";

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
  recording: z.looseObject({ id: text, role: z.enum(RECORDING_ROLES) }).optional(),
  screen: color.optional(),
  key: chroma.optional(),
  keyed: path.optional(),
  keyedId: id.optional(),
  keyStatus: z.enum(["pending", "ready", "error"]).optional(),
  wordEdits: z
    .array(
      z.looseObject({
        i: z.int().nonnegative().max(10_000_000),
        text: text.optional(),
        start: time.optional(),
        end: time.optional(),
        del: z.boolean().optional(),
        keep: z.boolean().optional(),
        was: text.optional(),
        at: time.optional(),
      }),
    )
    .max(20000)
    .optional(),
  voicePreset: z.enum(VOICE_PRESETS).optional(),
  treated: z
    .looseObject({ path, preset: z.enum(VOICE_PRESETS), version: z.int().nonnegative() })
    .optional(),
  treatStatus: z.enum(["pending", "ready", "error"]).optional(),
  motion: path.optional(),
  motionStatus: z.enum(["pending", "ready", "error"]).optional(),
  origin: z.literal("presenter").optional(),
  voiceTakes: z
    .array(
      z.looseObject({
        line: z.int().nonnegative(),
        start: time,
        end: time,
        retake: z.boolean().optional(),
      }),
    )
    .max(20000)
    .optional(),
  alpha: z.boolean().optional(),
});
const voiceMaster = z.looseObject({
  id,
  hash: z.string().max(200),
  createdAt: z.number().nonnegative(),
  scope: z.enum(["lesson", "section", "insert"]),
  pieces: z
    .array(
      z.looseObject({
        file: path,
        label: text,
        start: time,
        end: time,
        sourceMap: z
          .array(
            z.looseObject({
              at: time,
              duration: time,
              start: time,
              assetId: id,
              in: time,
              speed: number.positive().optional(),
            }),
          )
          .max(20000),
      }),
    )
    .max(500),
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
  duck: z.boolean().optional(),
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
  mutedFor: z.literal("heygen").optional(),
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
  by: z.string().min(1).max(200).optional(),
  items: z
    .array(
      z.looseObject({
        id,
        start: time,
        end: time,
        reason: text,
        text: text.optional(),
        near: number.optional(),
        anchors: z.array(sourceSpan).min(1).max(MAX_ANCHORS),
        wordKeys: z.array(z.string().max(300)).max(MAX_WORD_KEYS).optional(),
        issueId: z.string().min(1).max(300).optional(),
        category: z.enum(CUT_CATEGORIES).optional(),
        status: z.enum(["pending", "rejected"]),
      }),
    )
    .max(PROPOSAL_ITEM_LIMIT),
});

/** The pending proposals of a project, checked before they are kept (proposals.ts). */
export const proposalListSchema = z
  .array(proposal)
  .max(PROPOSAL_LIMIT)
  .refine(
    (list) => list.reduce((n, p) => n + p.items.length, 0) <= PROPOSAL_ITEM_LIMIT,
    "Too many proposal items",
  );

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
    captionBreaks: z.array(text).max(20000).optional(),
    cueStyles: z
      .array(
        z.looseObject({
          key: text,
          position: z.enum(["bottom", "middle", "top"]).optional(),
          size: number.positive().optional(),
          color: color.optional(),
        }),
      )
      .max(20000)
      .optional(),
    palette: id.optional(),
    paletteFonts: z.boolean().optional(),
    script: z
      .looseObject({
        text,
        section: z.int().nonnegative().optional(),
        confirmed: z.boolean().optional(),
      })
      .optional(),
    cleanup: z
      .looseObject({
        kept: z.array(z.string().min(1).max(300)).max(20000),
        minSilence: z.number().min(0.3).max(10).optional(),
        keepPause: z.number().min(0).max(2).optional(),
        kinds: z
          .looseObject({
            filler: z.boolean().optional(),
            silence: z.boolean().optional(),
            repeat: z.boolean().optional(),
          })
          .optional(),
        intentional: z.array(z.string().min(1).max(200)).max(200).optional(),
      })
      .optional(),
    stats: z.looseObject({ editSeconds: z.number().nonnegative() }).optional(),
    // Pending AI proposals, at most PROPOSAL_ITEM_LIMIT items in all (the save is one IPC value).
    proposals: proposalListSchema.optional(),
    voiceMasters: z.array(voiceMaster).max(VOICE_MASTER_LIMIT).optional(),
    audio: z
      .looseObject({
        ducking: z
          .looseObject({
            depth: z.number().min(0).max(1).optional(),
            ramp: z.number().min(0).max(10).optional(),
            hold: z.number().min(0).max(60).optional(),
          })
          .optional(),
      })
      .optional(),
    prepare: z
      .looseObject({
        step: z.enum(PREPARE_STEPS),
        decisions: z.partialRecord(z.enum(PREPARE_STEPS), z.enum(PREPARE_DECISIONS)),
        notes: z.partialRecord(z.enum(PREPARE_STEPS), z.string().max(2000)).optional(),
      })
      .optional(),
    reviewedSeams: z.array(z.string().min(1).max(300)).max(REVIEWED_LIMIT).optional(),
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

/**
 * Renderer may not supply native filter-script or font-directory paths. A video needs a bitrate;
 * only the podcast (sound only) goes without one.
 */
export const exportSpecSchema = z
  .strictObject({
    outPath: path.min(1),
    width: z.int().min(2).max(16384),
    height: z.int().min(2).max(16384),
    fps: z.number().positive().max(240),
    videoBitrate: z.number().min(0).max(1000000),
    quality: z.enum(EXPORT_QUALITIES).optional(),
    normalizeLoudness: z.boolean(),
    loudness: z
      .strictObject({ target: z.number().min(-40).max(-5), mode: z.enum(["two-pass", "one-pass"]) })
      .optional(),
    encoder: z.enum(ENCODERS),
    speech: z
      .array(z.tuple([time, time]))
      .max(20000)
      .optional(),
    captionCues: z
      .array(z.strictObject({ start: time, end: time, text: z.string().max(4000) }))
      .max(50000)
      .optional(),
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
  })
  .refine((spec) => spec.videoBitrate > 0 || spec.audioOnly === true, {
    message: "Video exports need a bitrate",
    path: ["videoBitrate"],
  }) satisfies z.ZodType<ExportSpec>;
