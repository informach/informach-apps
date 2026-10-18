import { z } from "zod";
import type { Ducking } from "./audio.ts";
import { projectSettingsSchema } from "./project-schema.ts";
import { templateById } from "./templates.ts";
import { newId } from "./timeline.ts";
import type { Project, ProjectSettings, Track } from "./types.ts";

/**
 * How a new lesson of a course starts (Arquivo › Salvar como modelo do curso): format, palette,
 * captions, tracks, the music bed and its ducking, and whether the opening and closing cards go
 * in. Kept per course in the app's profile (main/courseSetup.ts), outside every project, and
 * applied by Novo projeto. Only settings: no media of the lesson, no cuts.
 */

export const COURSE_SETUP_VERSION = 1;

export interface CourseSetupTrack {
  kind: Track["kind"];
  name: string;
  music?: boolean;
  duck?: boolean;
  height?: number;
  muted?: boolean;
  hidden?: boolean;
}

export interface CourseSetup {
  version: typeof COURSE_SETUP_VERSION;
  course: string;
  savedAt: number;
  settings: ProjectSettings;
  palette?: string;
  paletteFonts?: boolean;
  captions?: Project["captions"];
  tracks: CourseSetupTrack[];
  cards?: { opening?: boolean; closing?: boolean };
  audio?: {
    ducking?: Partial<Ducking>;
    /** The music bed: its file, level and the track (index in `tracks`) it plays on. */
    music?: { path: string; name: string; volume: number; track: number };
  };
}

const text = z.string().max(4096);
const color = z.string().regex(/^#(?:[\da-f]{6}|[\da-f]{8})$/i);

export const courseSetupSchema = z.looseObject({
  version: z.literal(COURSE_SETUP_VERSION),
  course: z.string().min(1).max(1024),
  savedAt: z.number().nonnegative(),
  settings: projectSettingsSchema,
  palette: z.string().min(1).max(200).optional(),
  paletteFonts: z.boolean().optional(),
  captions: z
    .looseObject({
      look: z.enum(["box", "outline", "karaoke"]),
      position: z.enum(["bottom", "middle", "top"]),
      size: z.number().positive().max(1000),
      font: text.optional(),
      highlight: color.optional(),
      burn: z.boolean(),
    })
    .optional(),
  tracks: z
    .array(
      z.looseObject({
        kind: z.enum(["video", "audio"]),
        name: z.string().min(1).max(200),
        music: z.boolean().optional(),
        duck: z.boolean().optional(),
        height: z.number().positive().max(1000).optional(),
        muted: z.boolean().optional(),
        hidden: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(64),
  cards: z
    .looseObject({ opening: z.boolean().optional(), closing: z.boolean().optional() })
    .optional(),
  audio: z
    .looseObject({
      ducking: z
        .looseObject({
          depth: z.number().min(0).max(1).optional(),
          ramp: z.number().min(0).max(10).optional(),
          hold: z.number().min(0).max(60).optional(),
        })
        .optional(),
      music: z
        .looseObject({
          path: z.string().min(1).max(32768),
          name: z.string().max(1024),
          volume: z.number().min(0).max(4),
          track: z.int().nonnegative().max(63),
        })
        .optional(),
    })
    .optional(),
}) satisfies z.ZodType<CourseSetup>;

/** Whether the lesson has the cards of a full-screen template (by the names of their pictures). */
function hasTemplate(p: Project, id: "opening" | "closing"): boolean {
  const label = templateById(id)?.label;
  if (!label) return false;
  const used = new Set(p.clips.map((c) => c.assetId));
  return p.assets.some((a) => used.has(a.id) && a.name.startsWith(`${label} · `));
}

/** The course template of a lesson: what a new lesson of the same course starts with. */
export function setupFromProject(p: Project, now = Date.now()): CourseSetup {
  const course = p.course?.trim();
  if (!course) throw new Error("Dê um curso a esta aula para salvar o modelo dele.");
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  const tracks = p.tracks.map(
    (t): CourseSetupTrack => ({
      kind: t.kind,
      name: t.name,
      ...(t.music ? { music: true } : {}),
      ...(t.duck !== undefined ? { duck: t.duck } : {}),
      ...(t.height !== undefined ? { height: t.height } : {}),
      ...(t.muted ? { muted: true } : {}),
      ...(t.hidden ? { hidden: true } : {}),
    }),
  );
  const musicIndex = p.tracks.findIndex((t) => t.music);
  const bed =
    musicIndex >= 0
      ? p.clips
          .filter((c) => c.trackId === p.tracks[musicIndex].id)
          .sort((a, b) => a.start - b.start)[0]
      : undefined;
  const bedAsset = bed && assets.get(bed.assetId);
  const cards = { opening: hasTemplate(p, "opening"), closing: hasTemplate(p, "closing") };
  return {
    version: COURSE_SETUP_VERSION,
    course,
    savedAt: now,
    settings: { ...p.settings },
    ...(p.palette ? { palette: p.palette } : {}),
    ...(p.paletteFonts ? { paletteFonts: true } : {}),
    ...(p.captions ? { captions: { ...p.captions } } : {}),
    tracks,
    ...(cards.opening || cards.closing ? { cards } : {}),
    ...(p.audio?.ducking || (bed && bedAsset && !bedAsset.missing)
      ? {
          audio: {
            ...(p.audio?.ducking ? { ducking: { ...p.audio.ducking } } : {}),
            ...(bed && bedAsset && !bedAsset.missing
              ? {
                  music: {
                    path: bedAsset.path,
                    name: bedAsset.name,
                    volume: bed.volume,
                    track: musicIndex,
                  },
                }
              : {}),
          },
        }
      : {}),
  };
}

/**
 * A new, empty lesson set up like the course template: its tracks (new ids), palette, captions
 * and ducking, and the cards still to come. The music bed is placed after (it is imported media).
 * Returns the lesson and the id of the music track, when the template has music.
 */
export function applySetup(
  p: Project,
  setup: CourseSetup,
): { project: Project; musicTrack?: string } {
  const tracks: Track[] = setup.tracks.map((t) => ({
    id: newId("t"),
    kind: t.kind,
    name: t.name,
    muted: !!t.muted,
    hidden: !!t.hidden,
    locked: false,
    ...(t.music ? { music: true } : {}),
    ...(t.duck !== undefined ? { duck: t.duck } : {}),
    ...(t.height !== undefined ? { height: t.height } : {}),
  }));
  const music = setup.audio?.music;
  const musicTrack = music ? tracks[music.track]?.id : undefined;
  const next: Project = {
    ...p,
    settings: { ...setup.settings },
    tracks,
    ...(setup.palette ? { palette: setup.palette } : {}),
    ...(setup.paletteFonts ? { paletteFonts: true } : {}),
    ...(setup.captions ? { captions: { ...setup.captions } } : {}),
    ...(setup.audio?.ducking ? { audio: { ducking: { ...setup.audio.ducking } } } : {}),
    ...(setup.cards?.opening || setup.cards?.closing ? { pendingStart: { ...setup.cards } } : {}),
  };
  return { project: next, ...(musicTrack ? { musicTrack } : {}) };
}

/** The file name a course template is kept under: the course, without what Windows refuses. */
export function setupFileName(course: string): string {
  const safe = [...course.trim().toLowerCase()]
    .filter((ch) => ch.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(ch))
    .join("")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/, "")
    .slice(0, 80);
  return `${safe || "sem curso"}.json`;
}

/** Same course, however it was typed (spacing and capitals). */
export const sameCourse = (a: string | undefined, b: string | undefined): boolean =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
