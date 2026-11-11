import { z } from "zod";

/**
 * The link between Edi tools, as Premiere and After Effects have it: a clip of an EdiAula lesson
 * is an EdiSVG animation, "Editar no EdiSVG" opens that animation, and saving it in EdiSVG
 * updates the clip in the lesson by itself. Each tool stays whole on its own.
 *
 * Everything goes through files, never through one process calling another:
 * - Requests to a tool: `%APPDATA%\<tool>\pedidos\<id>.json`, written whole (atomically). The
 *   tool reads them when it opens and watches the folder while open; each is removed once done.
 * - Renders of a project's linked animations: the folder `<project> · renders` beside the
 *   project file, with `vinculos.json` written last, listing each linked animation and its
 *   current render. A render's file name carries its content hash: a changed animation is a new
 *   file, so whoever plays it never shows an old picture from a cache.
 *
 * This module is the contract alone (no disk): the schemas both tools parse with.
 */

export const LINK_VERSION = 1;
/** A tool's requests folder, inside its profile (`%APPDATA%\<tool>`). */
export const REQUESTS_FOLDER = "pedidos";
/** The renders folder beside a project: `<project name> · renders`. */
export const RENDERS_SUFFIX = " · renders";
export const MANIFEST_FILE = "vinculos.json";
/** Bumped when the way a render is made changes: every linked animation renders again. */
export const RENDER_VERSION = 1;

export const animationIdSchema = z.string().regex(/^[a-z]+-[\w-]{1,100}$/);
export const artboardIdSchema = z.string().regex(/^artboard-[\w-]{1,100}$/);
const requestId = z.string().regex(/^[\w-]{8,64}$/);

/** An absolute Windows (or POSIX, in tests) path to an EdiSVG project. */
export const edisvgProjectPathSchema = z
  .string()
  .min(3)
  .max(1000)
  .refine(
    (path) => /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(path),
    "O caminho do projeto não é absoluto.",
  )
  .refine((path) => /\.edisvg$/i.test(path), "O projeto do vínculo não é um arquivo .edisvg.");

/** An absolute path to an EdiAula lesson (its pipelines read the lesson's voice and screen). */
export const ediaulaLessonPathSchema = z
  .string()
  .min(3)
  .max(1000)
  .refine((path) => /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(path), "O caminho da aula não é absoluto.")
  .refine((path) => /\.ediaula$/i.test(path), "A aula não é um arquivo .ediaula.");

const requestBase = {
  version: z.literal(LINK_VERSION),
  id: requestId,
  /** Who asked: the tool's id, for the message the person sees. */
  from: z.enum(["ediaula"]),
  project: edisvgProjectPathSchema,
};

/**
 * What a tool may ask EdiSVG:
 * - `create`: a new artboard and animation in `project` (made there if it is not), the size and
 *   length of the lesson's stretch, linked (rendered at every save);
 * - `link`: an animation already in `project`, now linked;
 * - `open`: show that animation (the project opened, its artboard and animation chosen).
 */
export const linkRequestSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...requestBase,
    type: z.literal("create"),
    name: z.string().trim().min(1).max(120),
    width: z.int().min(16).max(3840),
    height: z.int().min(16).max(3840),
    fps: z.int().min(1).max(60),
    /** Seconds. */
    duration: z.number().min(0.1).max(1200),
    /** The lesson it is for: its pipelines take the lesson's voice and screen from it. */
    lesson: ediaulaLessonPathSchema.optional(),
  }),
  z.strictObject({ ...requestBase, type: z.literal("link"), animationId: animationIdSchema }),
  z.strictObject({ ...requestBase, type: z.literal("open"), animationId: animationIdSchema }),
]);
export type LinkRequest = z.infer<typeof linkRequestSchema>;

/** A render's file name: the animation and the hash of what it shows. */
export const renderFileName = (animationId: string, hash: string): string =>
  `${animationId}-${hash}.webm`;
const RENDER_FILE = /^[a-z]+-[\w-]{1,100}-[0-9a-f]{16}\.webm$/;

export const renderSchema = z.strictObject({
  /** A file of the renders folder. */
  file: z.string().regex(RENDER_FILE),
  width: z.int().min(16).max(3840),
  height: z.int().min(16).max(3840),
  fps: z.int().min(1).max(60),
  frames: z.int().min(1).max(72_000),
  /** Seconds. */
  duration: z.number().positive().max(1200),
  /** Of the compiled animation, its size, rate and RENDER_VERSION. */
  hash: z.string().regex(/^[0-9a-f]{16}$/),
});
export type Render = z.infer<typeof renderSchema>;

export const linkedAnimationSchema = z.strictObject({
  animationId: animationIdSchema,
  artboardId: artboardIdSchema,
  name: z.string().min(1).max(200),
  /** The request that created it, so the tool that asked finds its animation. */
  requestId: requestId.optional(),
  /** The lesson it is for (from the request), which a pipeline run on it reads. */
  lesson: ediaulaLessonPathSchema.optional(),
  /** Lesson second its frame 0 plays at, when a pipeline placed it on the lesson's words. */
  start: z.number().min(0).max(360_000).optional(),
  /** Its current render; none yet while the first one is made. */
  render: renderSchema.optional(),
  /** Why the last render failed (the previous render, if any, stays). */
  error: z.string().max(500).optional(),
  /** When its entry last changed (ms). */
  updatedAt: z.number().int().nonnegative(),
});
export type LinkedAnimation = z.infer<typeof linkedAnimationSchema>;

export const rendersManifestSchema = z
  .strictObject({
    version: z.literal(LINK_VERSION),
    /** The EdiSVG project's id (stable across saves). */
    projectId: z.string().min(1).max(200),
    items: z.array(linkedAnimationSchema).max(500),
  })
  .refine(
    (m) => new Set(m.items.map((i) => i.animationId)).size === m.items.length,
    "Animação vinculada repetida.",
  );
export type RendersManifest = z.infer<typeof rendersManifestSchema>;

/**
 * An asset of another tool's file, as the tool that places it keeps it: which project and
 * animation, and the hash of the render it plays (a different one in the manifest is an update).
 */
export const assetLinkSchema = z.strictObject({
  app: z.literal("edisvg"),
  project: edisvgProjectPathSchema,
  animationId: animationIdSchema.optional(),
  artboardId: artboardIdSchema.optional(),
  /** The request that made it, until its animation is known. */
  requestId: requestId.optional(),
  hash: z
    .string()
    .regex(/^[0-9a-f]{16}$/)
    .optional(),
  /** The lesson second the animation's own placement said (a pipeline's), once applied. */
  start: z.number().min(0).max(360_000).optional(),
});
export type AssetLink = z.infer<typeof assetLinkSchema>;

/**
 * What another tool needs to list a project's animations (to link one) without knowing the
 * project format: the artboards and animations of a .edisvg, read leniently.
 */
export const edisvgSummarySchema = z.looseObject({
  id: z.string().min(1).max(200),
  name: z.string().max(200).optional(),
  artboards: z
    .array(
      z.looseObject({
        id: artboardIdSchema,
        name: z.string().max(200),
        scene: z.looseObject({
          viewBox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        }),
      }),
    )
    .max(100),
  motion: z
    .looseObject({
      animations: z
        .array(
          z.looseObject({
            id: animationIdSchema,
            name: z.string().max(200),
            fps: z.number(),
            frames: z.number(),
          }),
        )
        .max(1000),
    })
    .optional(),
});
export type EdisvgSummary = z.infer<typeof edisvgSummarySchema>;
