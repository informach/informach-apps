import { z } from "zod";
import type { Artboard } from "./project";

/**
 * Which stretch of an EdiAula lesson an animation of the artboard animates (project v26): a
 * pipeline run on a lesson package records it on the artboard it worked in (the scene, or the
 * transparent layer of a demonstration). A lesson section mixes both kinds, each over its own
 * phrases: the next run's phrase list shows which are done, and sending the animations back to
 * the lesson puts each at its seconds. Editor and pipeline metadata: no export draws it.
 */
export const lessonClipSchema = z.strictObject({
  clipId: z.string().regex(/^animation-[\w-]{1,100}$/),
  /** The recipe kind: "game-scene" covers the screen, "screen-demo" is a layer over it. */
  kind: z.enum(["game-scene", "screen-demo"]),
  /** The lesson's id in EdiAula, and the section of its script. */
  lessonId: z.string().regex(/^[\w-]{1,100}$/),
  section: z.int().min(0).max(10_000),
  /** Lesson seconds the animation's frame 0 is at, and where the stretch ends. */
  start: z.number().min(0).max(360_000),
  end: z.number().min(0).max(360_000),
  /** The script phrases it animates, as the lesson's script writes them (empty: typed by hand). */
  phrases: z.array(z.string().min(1).max(2_000)).max(2_000),
});
export type LessonClip = z.infer<typeof lessonClipSchema>;
export const LESSON_CLIP_LIMIT = 200;
export const lessonClipsSchema = z
  .array(lessonClipSchema)
  .max(LESSON_CLIP_LIMIT)
  .superRefine((clips, ctx) => {
    if (new Set(clips.map((clip) => clip.clipId)).size !== clips.length)
      ctx.addIssue({ code: "custom", message: "Trecho da aula repetido para a mesma animação." });
    for (const clip of clips)
      if (clip.end < clip.start)
        ctx.addIssue({ code: "custom", message: "Trecho da aula termina antes de começar." });
  });

/** Records (or replaces, by animation) the stretch of the lesson an animation of the artboard is. */
export const lessonClipCommandSchema = z.strictObject({
  type: z.literal("lesson-clip"),
  value: lessonClipSchema,
});
export function applyLessonClip(
  board: Artboard,
  animationIds: ReadonlySet<string>,
  command: z.infer<typeof lessonClipCommandSchema>,
) {
  if (!animationIds.has(command.value.clipId)) throw new Error("Animação não encontrada.");
  const clips = (board.lessonClips ?? []).filter((clip) => clip.clipId !== command.value.clipId);
  board.lessonClips = lessonClipsSchema.parse([...clips, command.value]);
}

/** Drops the stretch of an animation that is gone (its record would point at nothing). */
export function dropLessonClips(board: Artboard, animationId: string) {
  if (!board.lessonClips) return;
  board.lessonClips = board.lessonClips.filter((clip) => clip.clipId !== animationId);
  if (!board.lessonClips.length) delete board.lessonClips;
}
