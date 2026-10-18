import { z } from "zod";
import type { AnnotationKind } from "./annotation.ts";
import type { CaptionStyle } from "./captions.ts";
import type { ChromaKey } from "./chroma.ts";
import { avatarMedia } from "./cleanup.ts";
import { clipLayout, type Motion, type Transform } from "./compose.ts";
import { DEFAULT_CURSOR_FX } from "./cursor.ts";
import type { DirectionAnnotation, DirectionRule } from "./screenDirections.ts";
import { clipEnd, projectDuration } from "./timeline.ts";
import type { Clip, Project, Track } from "./types.ts";

/**
 * The course template, version 2: how a course's lessons look and are put together, as rules
 * instead of a list of clips. It comes out of a finished lesson (courseTemplateFrom), travels in
 * the editing model's Markdown as a JSON block and is kept per course in
 * userData/cursos/<curso>/modelo.json; "Preparar aula" applies it to a new lesson as drafts.
 */

export interface AnnotationStyle {
  kind: AnnotationKind;
  color?: string;
  fill?: string;
  ink?: string;
  fontFamily?: string;
  fontSize?: number;
  enter?: Motion;
  exit?: Motion;
  duration?: number;
}

export interface Rule {
  when: {
    /** Words of a "Na tela" direction (screenDirections.ts ruleMatches). */
    screenText?: string;
    insertId?: string;
    /** A speaker of the script ("Debinha"), or "avatar" for every presenter. */
    speaker?: string;
    /** Which presenter a layout is for (PresenterRole); absent in templates saved before. */
    role?: PresenterRole;
    event?: "click" | "opening" | "closing";
  };
  do: {
    annotation?: AnnotationStyle & { x?: number; y?: number };
    zoom?: { scale: number };
    layout?: { x: number; y: number; scale: number; fadeIn?: number; fadeOut?: number };
  };
}

export interface CourseTemplate {
  version: 2;
  course?: string;
  format: { width: number; height: number; fps: number };
  palette?: string;
  /** The palette's fonts (Project.paletteFonts). */
  fonts?: boolean;
  captions?: CaptionStyle & { burn: boolean };
  cards?: { opening: boolean; closing: boolean; closingText?: string };
  avatar?: {
    transform?: Pick<Transform, "x" | "y" | "scale">;
    fadeIn?: number;
    fadeOut?: number;
    key?: Partial<ChromaKey>;
  };
  cursor?: { size?: number; smooth?: number; clicks?: boolean; halo?: boolean; hideIdle?: boolean };
  zoom?: { auto: boolean; scale?: number };
  music?: { volume: number; ducking: boolean };
  cleanup?: {
    minSilence?: number;
    keepPause?: number;
    kinds?: { filler?: boolean; silence?: boolean; repeat?: boolean };
  };
  annotations?: { maxPerMinute: number; presets: AnnotationStyle[] };
  rules?: Rule[];
}

/** Marks the JSON block of a course template inside an editing model. */
export const COURSE_TEMPLATE_MARK = "ediaula-modelo-do-curso";

const num = z.number().finite();
const color = z.string().regex(/^#(?:[\da-f]{6}|[\da-f]{8})$/i);
const kinds = z.enum([
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
]);
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
const annotationStyle = z.looseObject({
  kind: kinds,
  color: color.optional(),
  fill: color.optional(),
  ink: color.optional(),
  fontFamily: z.string().max(200).optional(),
  fontSize: num.positive().max(400).optional(),
  enter: motion.optional(),
  exit: motion.optional(),
  duration: num.positive().max(60).optional(),
});
const fraction = num.min(-1).max(2);
const rule = z.looseObject({
  when: z.looseObject({
    screenText: z.string().max(200).optional(),
    insertId: z.string().max(200).optional(),
    speaker: z.string().max(200).optional(),
    role: z.enum(["main", "insert"]).optional(),
    event: z.enum(["click", "opening", "closing"]).optional(),
  }),
  do: z.looseObject({
    annotation: annotationStyle
      .extend({ x: fraction.optional(), y: fraction.optional() })
      .optional(),
    zoom: z.looseObject({ scale: num.min(1).max(5) }).optional(),
    layout: z
      .looseObject({
        x: fraction,
        y: fraction,
        scale: num.positive().max(10),
        fadeIn: num.min(0).max(5).optional(),
        fadeOut: num.min(0).max(5).optional(),
      })
      .optional(),
  }),
});

export const courseTemplateSchema = z.looseObject({
  version: z.literal(2),
  course: z.string().max(1024).optional(),
  format: z.looseObject({
    width: z.int().min(2).max(16384),
    height: z.int().min(2).max(16384),
    fps: num.positive().max(240),
  }),
  palette: z.string().max(200).optional(),
  fonts: z.boolean().optional(),
  captions: z
    .looseObject({
      look: z.enum(["box", "outline", "karaoke"]),
      position: z.enum(["bottom", "middle", "top"]),
      size: num.positive().max(30),
      font: z.string().max(200).optional(),
      highlight: color.optional(),
      burn: z.boolean(),
    })
    .optional(),
  cards: z
    .looseObject({
      opening: z.boolean(),
      closing: z.boolean(),
      closingText: z.string().max(400).optional(),
    })
    .optional(),
  avatar: z
    .looseObject({
      transform: z
        .looseObject({ x: fraction, y: fraction, scale: num.positive().max(10) })
        .optional(),
      fadeIn: num.min(0).max(5).optional(),
      fadeOut: num.min(0).max(5).optional(),
      key: z
        .looseObject({
          color: color.optional(),
          threshold: num.optional(),
          softness: num.optional(),
          despill: num.optional(),
          choke: num.optional(),
        })
        .optional(),
    })
    .optional(),
  cursor: z
    .looseObject({
      size: num.min(0.5).max(6).optional(),
      smooth: num.min(0).max(1).optional(),
      clicks: z.boolean().optional(),
      halo: z.boolean().optional(),
      hideIdle: z.boolean().optional(),
    })
    .optional(),
  zoom: z.looseObject({ auto: z.boolean(), scale: num.min(1).max(5).optional() }).optional(),
  music: z.looseObject({ volume: num.min(0).max(4), ducking: z.boolean() }).optional(),
  cleanup: z
    .looseObject({
      minSilence: num.min(0.3).max(10).optional(),
      keepPause: num.min(0).max(2).optional(),
      kinds: z
        .looseObject({
          filler: z.boolean().optional(),
          silence: z.boolean().optional(),
          repeat: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
  annotations: z
    .looseObject({
      maxPerMinute: num.min(0).max(60),
      presets: z.array(annotationStyle).max(100),
    })
    .optional(),
  rules: z.array(rule).max(500).optional(),
}) satisfies z.ZodType<CourseTemplate>;

/** A course template read from anywhere (modelo.json, an editing model): null when it is not one. */
export function readCourseTemplate(raw: unknown): CourseTemplate | null {
  const parsed = courseTemplateSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { ediaula: _mark, ...template } = parsed.data;
  return template;
}

/** A fenced JSON block that user text cannot close early. */
export function jsonBlock(value: unknown): string {
  const json = JSON.stringify(value, null, 2);
  const fence = "`".repeat(Math.max(3, ...[...json.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  return `${fence}json\n${json}\n${fence}`;
}

/** The course template's section of an editing model (buildEditingTemplate writes it). */
export function courseTemplateMarkdown(template: CourseTemplate): string {
  return [
    "## Modelo do curso (v2)",
    "",
    "O EdiAula lê este bloco para aplicar o modelo em outra aula do curso: paleta, legenda, cartelas, posição do apresentador, cursor, zoom, música, limpeza e as regras das anotações. Cada parte entra como rascunho para revisar.",
    "",
    jsonBlock({ ediaula: COURSE_TEMPLATE_MARK, ...template }),
    "",
  ].join("\n");
}

/**
 * The course template inside an editing model, or null: a model of version 1 (only the list of
 * clips) is still a reference to read, and has no block to apply.
 */
export function parseCourseTemplate(md: string): CourseTemplate | null {
  const blocks = md.replace(/\r\n?/g, "\n").matchAll(/(`{3,})json\n([\s\S]*?)\n\1(?!`)/g);
  for (const m of blocks) {
    let value: unknown;
    try {
      value = JSON.parse(m[2]);
    } catch {
      continue;
    }
    if (
      !value ||
      typeof value !== "object" ||
      Reflect.get(value, "ediaula") !== COURSE_TEMPLATE_MARK
    )
      continue;
    const template = readCourseTemplate(value);
    if (template) return template;
  }
  return null;
}

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** The folder of a course under userData/cursos: its name, safe as a Windows folder name. */
export function courseFolderName(course: string): string {
  const clean = [...course]
    .filter((ch) => ch.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 120)
    .replace(/[. ]+$/, "");
  if (!clean || /^\.+$/.test(clean)) return "sem curso";
  return RESERVED.test(clean) ? `_${clean}` : clean;
}

/** Background music: marked as music, or an audio track named so (older lessons). */
export const isMusicTrack = (track: Track): boolean =>
  !!track.music || (track.kind === "audio" && /m[uú]sica/i.test(track.name));

/**
 * Who a presenter clip is: the lesson's own presenter (the presenter's video of the whole lesson,
 * a person with the background removed) or an insert of the script (a character's line).
 */
export type PresenterRole = "main" | "insert";
export const presenterRole = (c: Pick<Clip, "insertId">): PresenterRole =>
  c.insertId ? "insert" : "main";

/** Clips of a presenter (an avatar or a person): script inserts and presenter media. */
export function presenterClips(project: Project): Clip[] {
  const avatar = avatarMedia(project);
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  return project.clips.filter(
    (c) =>
      !c.annotation &&
      !c.zoomLayer &&
      assets.get(c.assetId)?.kind === "video" &&
      (!!c.insertId || avatar.has(c.assetId)),
  );
}

function mostCommon<T>(values: readonly T[]): T | undefined {
  const count = new Map<string, { value: T; n: number }>();
  for (const v of values) {
    const key = JSON.stringify(v);
    const entry = count.get(key);
    if (entry) entry.n++;
    else count.set(key, { value: v, n: 1 });
  }
  let best: { value: T; n: number } | undefined;
  for (const e of count.values()) if (!best || e.n > best.n) best = e;
  return best?.value;
}

const round = (v: number, d = 3): number => Math.round(v * 10 ** d) / 10 ** d;

const styleOf = (c: Clip): AnnotationStyle | null => {
  const a = c.annotation;
  if (!a) return null;
  return {
    kind: a.kind,
    color: a.color,
    ...(a.fill ? { fill: a.fill } : {}),
    ...(a.ink ? { ink: a.ink } : {}),
    ...(a.fontFamily ? { fontFamily: a.fontFamily } : {}),
    ...(a.fontSize ? { fontSize: a.fontSize } : {}),
    ...(c.enter ? { enter: c.enter } : {}),
    ...(c.exit ? { exit: c.exit } : {}),
    duration: round(c.duration, 2),
  };
};

/** The words of a direction worth matching: its quoted text, or its first content words. */
export function directionKey(text: string): string {
  const quoted = /["“”']([^"“”']{2,40})["“”']/.exec(text)?.[1];
  if (quoted) return quoted.trim();
  return text
    .split(/\s+/)
    .filter((w) => w.replace(/[^\p{L}\p{N}]/gu, "").length >= 4)
    .slice(0, 3)
    .join(" ");
}

/**
 * The course template of a finished lesson. `directions` (screenDirections on the lesson's own
 * script) turn the annotations shown at each "Na tela" into rules for the next lessons.
 */
export function courseTemplateFrom(
  project: Project,
  opts: { directions?: readonly DirectionAnnotation[] } = {},
): CourseTemplate {
  const duration = projectDuration(project);
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const annotations = project.clips.filter((c) => c.annotation && c.annotation.kind !== "card");
  const cards = project.clips.filter((c) => c.annotation?.kind === "card");
  const presenters = presenterClips(project);
  const recordings = project.assets.filter(
    (a) => a.cursor && project.clips.some((c) => c.assetId === a.id),
  );
  const autoScales = recordings.flatMap((a) =>
    (a.zooms ?? []).filter((z) => z.auto).map((z) => z.scale),
  );
  const musicTracks = new Set(project.tracks.filter(isMusicTrack).map((t) => t.id));
  const musicClips = project.clips.filter((c) => musicTracks.has(c.trackId));
  const fx = recordings.find((a) => a.cursorFx)?.cursorFx;
  // Each presenter keeps its own place: the lesson's presenter and the inserts do not share one.
  const placeOf = (role: PresenterRole) => {
    const clips = presenters.filter((c) => presenterRole(c) === role);
    const transform = mostCommon(
      clips
        .filter((c) => c.transform)
        .map((c) => ({
          x: round(c.transform?.x ?? 0.5),
          y: round(c.transform?.y ?? 0.5),
          scale: round(c.transform?.scale ?? 1),
        })),
    );
    const fades = mostCommon(clips.map((c) => [c.fadeIn ?? 0, c.fadeOut ?? 0]));
    return transform ? { transform, fades } : null;
  };
  const places = { main: placeOf("main"), insert: placeOf("insert") };
  const transform = (places.main ?? places.insert)?.transform;
  const fades = (places.main ?? places.insert)?.fades;
  const key = presenters.map((c) => assets.get(c.assetId)?.key).find(Boolean);
  const closing = cards.find((c) => Math.abs(clipEnd(c) - duration) < 0.2);
  const presets = new Map<string, AnnotationStyle>();
  for (const c of annotations) {
    const s = styleOf(c);
    if (s && !presets.has(s.kind)) presets.set(s.kind, s);
  }
  const rules: Rule[] = [];
  if (autoScales.length)
    rules.push({ when: { event: "click" }, do: { zoom: { scale: round(autoScales[0], 2) } } });
  for (const role of ["main", "insert"] as const) {
    const place = places[role];
    if (!place) continue;
    rules.push({
      when: { speaker: "avatar", role },
      do: {
        layout: {
          ...place.transform,
          ...(place.fades ? { fadeIn: place.fades[0], fadeOut: place.fades[1] } : {}),
        },
      },
    });
  }
  for (const d of opts.directions ?? []) {
    const shown = annotations.find((c) => Math.abs(c.start - d.at) <= 1.5);
    const style = shown && styleOf(shown);
    const screenText = directionKey(d.direction);
    if (!shown?.transform || !style || !screenText) continue;
    if (rules.some((r) => r.when.screenText === screenText)) continue;
    rules.push({
      when: { screenText },
      do: { annotation: { ...style, x: round(shown.transform.x), y: round(shown.transform.y) } },
    });
  }
  return {
    version: 2,
    ...(project.course ? { course: project.course } : {}),
    format: { ...project.settings },
    ...(project.palette ? { palette: project.palette } : {}),
    ...(project.paletteFonts ? { fonts: true } : {}),
    ...(project.captions ? { captions: { ...project.captions } } : {}),
    cards: {
      opening: cards.some((c) => c.start <= 0.1),
      closing: !!closing,
      ...(closing?.annotation?.text ? { closingText: closing.annotation.text } : {}),
    },
    ...(transform || key
      ? {
          avatar: {
            ...(transform ? { transform } : {}),
            ...(fades ? { fadeIn: fades[0], fadeOut: fades[1] } : {}),
            ...(key ? { key: { ...key } } : {}),
          },
        }
      : {}),
    ...(fx
      ? {
          cursor: {
            size: fx.size,
            smooth: fx.smooth,
            clicks: fx.clicks,
            halo: fx.halo,
            hideIdle: fx.hideIdle,
          },
        }
      : {}),
    ...(recordings.length
      ? {
          zoom: {
            auto: autoScales.length > 0,
            ...(autoScales.length ? { scale: round(autoScales[0], 2) } : {}),
          },
        }
      : {}),
    ...(musicClips.length
      ? {
          music: {
            volume: round(musicClips.reduce((s, c) => s + c.volume, 0) / musicClips.length, 2),
            ducking: true,
          },
        }
      : {}),
    ...(project.cleanup
      ? {
          cleanup: {
            ...(project.cleanup.minSilence !== undefined
              ? { minSilence: project.cleanup.minSilence }
              : {}),
            ...(project.cleanup.keepPause !== undefined
              ? { keepPause: project.cleanup.keepPause }
              : {}),
            ...(project.cleanup.kinds ? { kinds: { ...project.cleanup.kinds } } : {}),
          },
        }
      : {}),
    annotations: {
      maxPerMinute: duration > 0 ? Math.max(1, Math.ceil(annotations.length / (duration / 60))) : 0,
      presets: [...presets.values()],
    },
    rules,
  };
}

/** The rules that place an annotation for a "Na tela" direction. */
export const directionRules = (t: CourseTemplate | null | undefined): DirectionRule[] =>
  (t?.rules ?? []).flatMap((r) =>
    r.when.screenText && r.do.annotation
      ? [{ when: { screenText: r.when.screenText }, do: { annotation: r.do.annotation } }]
      : [],
  );

type Layout = { x: number; y: number; scale: number; fadeIn?: number; fadeOut?: number };

/**
 * Where the template puts a presenter of `role`: its own layout rule. A template saved before the
 * roles has one layout for every presenter (its rule, else the avatar block): it goes on the
 * lesson's own presenter, and on the inserts only when the lesson has none (`lessonHasMain`),
 * since both in the same place would cover each other.
 */
export function presenterLayout(
  t: CourseTemplate,
  role: PresenterRole = "main",
  lessonHasMain = role === "main",
): Layout | null {
  const rules = (t.rules ?? []).filter((r) => r.when.speaker === "avatar" && r.do.layout);
  const own = rules.find((r) => r.when.role === role)?.do.layout;
  if (own) return own;
  if (rules.some((r) => r.when.role)) return null;
  if (role === "insert" && lessonHasMain) return null;
  const rule = rules[0]?.do.layout;
  if (rule) return rule;
  const tr = t.avatar?.transform;
  return tr
    ? {
        ...tr,
        ...(t.avatar?.fadeIn !== undefined ? { fadeIn: t.avatar.fadeIn } : {}),
        ...(t.avatar?.fadeOut !== undefined ? { fadeOut: t.avatar.fadeOut } : {}),
      }
    : null;
}

/**
 * The look of the template on a lesson, without drawing anything: where the presenter stands, how
 * the pointer is drawn, the music (marked as music, at the template's volume) and the cleanup
 * choices. The palette and the captions are applied apart (the palette redraws annotations).
 */
export function templateLook(project: Project, t: CourseTemplate): Project {
  const presenterList = presenterClips(project);
  const hasMain = presenterList.some((c) => presenterRole(c) === "main");
  const layouts = {
    main: presenterLayout(t, "main", hasMain),
    insert: presenterLayout(t, "insert", hasMain),
  };
  const placed = (c: Clip, layout: Layout): Clip => {
    const base = c.transform ?? { x: 0.5, y: 0.5, scale: 1, opacity: 1 };
    return {
      ...c,
      transform: { ...base, x: layout.x, y: layout.y, scale: layout.scale },
      ...(layout.fadeIn !== undefined ? { fadeIn: layout.fadeIn || undefined } : {}),
      ...(layout.fadeOut !== undefined ? { fadeOut: layout.fadeOut || undefined } : {}),
    };
  };
  const moved = new Map<string, Clip>();
  for (const c of presenterList) {
    const layout = layouts[presenterRole(c)];
    if (layout) moved.set(c.id, placed(c, layout));
  }
  // An insert never lands over the lesson's presenter on screen at the same time: it stays put.
  const assetOf = new Map(project.assets.map((a) => [a.id, a]));
  const box = (c: Clip) => {
    const a = assetOf.get(c.assetId);
    return a?.width && a.height ? clipLayout(c, a, project.settings).visible : null;
  };
  const mains = presenterList.filter((c) => presenterRole(c) === "main");
  for (const c of presenterList) {
    const next = moved.get(c.id);
    if (!next || presenterRole(c) !== "insert") continue;
    const b = box(next);
    const covers = mains.some((m) => {
      const o = box(moved.get(m.id) ?? m);
      return (
        !!b &&
        !!o &&
        m.start < clipEnd(c) &&
        clipEnd(m) > c.start &&
        b.x < o.x + o.w &&
        b.x + b.w > o.x &&
        b.y < o.y + o.h &&
        b.y + b.h > o.y
      );
    });
    if (covers) moved.delete(c.id);
  }
  const music = new Set(project.tracks.filter(isMusicTrack).map((tr) => tr.id));
  const clips = project.clips.map((c) => {
    const next = moved.get(c.id);
    if (next) return next;
    if (t.music && music.has(c.trackId) && c.volume !== t.music.volume)
      return { ...c, volume: t.music.volume };
    return c;
  });
  const tracks = t.music?.ducking
    ? project.tracks.map((tr) => (music.has(tr.id) && !tr.music ? { ...tr, music: true } : tr))
    : project.tracks;
  const assets = t.cursor
    ? project.assets.map((a) =>
        a.cursor ? { ...a, cursorFx: { ...DEFAULT_CURSOR_FX, ...a.cursorFx, ...t.cursor } } : a,
      )
    : project.assets;
  const out: Project = { ...project, clips, tracks, assets };
  if (t.cleanup)
    out.cleanup = {
      kept: [],
      ...project.cleanup,
      ...(t.cleanup.minSilence !== undefined ? { minSilence: t.cleanup.minSilence } : {}),
      ...(t.cleanup.keepPause !== undefined ? { keepPause: t.cleanup.keepPause } : {}),
      ...(t.cleanup.kinds ? { kinds: { ...project.cleanup?.kinds, ...t.cleanup.kinds } } : {}),
    };
  return out;
}
