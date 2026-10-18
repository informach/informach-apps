import { type CourseTemplate, hasLessonMedia, startingLesson } from "@shared/courseTemplate";
import { newId, projectDuration } from "@shared/timeline";
import type { Clip, Project } from "@shared/types";
import { useApp } from "@/state/app";
import { type Commit, useProject } from "@/state/project";
import { addCard } from "./annotations";
import { importMedia } from "./importMedia";

/**
 * A new lesson started from its course's template (shared/courseTemplate.ts startingLesson). The
 * tracks, palette, captions and ducking are its starting state (not an edit to undo); the music
 * joins the library right away. When the first media reaches the timeline, the opening and
 * closing cards go in (the opening pushes the lesson forward) and the music is laid under all of
 * it, as one Ctrl+Z. These are the only cards such a lesson gets: "Preparar aula" leaves them to
 * this, and the template is not offered again on it.
 */
export async function startFromTemplate(template: CourseTemplate): Promise<void> {
  const open = useProject.getState().project;
  if (!open) return;
  const { project, musicTrack } = startingLesson(open, template);
  useProject.getState().patch(() => project);
  const music = template.music;
  if (music?.file && musicTrack) {
    const [asset] = await importMedia([music.file.path]);
    if (asset?.hasAudio && asset.duration > 0)
      useProject.getState().patch((p) => ({
        ...p,
        pendingStart: {
          ...p.pendingStart,
          music: { assetId: asset.id, trackId: musicTrack, volume: music.volume },
        },
      }));
    else
      useApp
        .getState()
        .toast(
          `A música do modelo (${music.file.name}) não foi encontrada. A aula começa sem ela.`,
          "info",
        );
  }
  await useProject.getState().saveNow();
}

const running = new Set<string>();

/** The music bed from 0:00 to the end of the lesson, repeated, with a fade at both ends. */
export function musicBed(
  p: Project,
  music: { assetId: string; trackId: string; volume: number },
): Clip[] {
  const asset = p.assets.find((a) => a.id === music.assetId);
  const end = projectDuration(p);
  if (!asset || !(asset.duration > 0) || !p.tracks.some((t) => t.id === music.trackId)) return [];
  const clips: Clip[] = [];
  for (let at = 0; at < end - 0.05; at += asset.duration)
    clips.push({
      id: newId("c"),
      assetId: asset.id,
      trackId: music.trackId,
      start: at,
      in: 0,
      duration: Math.min(asset.duration, end - at),
      volume: music.volume,
      fadeIn: at === 0 ? 1 : undefined,
      fadeOut: at + asset.duration >= end ? 2 : undefined,
    });
  return clips;
}

/**
 * The cards are drawn first (each one waits for its picture) into a commit that only gathers
 * what they change; the lesson changes once at the end, with the music, in one undo step.
 */
async function completeStart(projectId: string): Promise<void> {
  const state = useProject.getState();
  const pending = state.project?.id === projectId ? state.project.pendingStart : undefined;
  if (!pending || running.has(projectId)) return;
  running.add(projectId);
  const changes: ((p: Project) => Project)[] = [];
  const gather: Commit = (fn) => {
    changes.push(fn);
    return true;
  };
  const failed: string[] = [];
  const added: string[] = [];
  try {
    const card = async (where: "start" | "end", label: string, text?: string): Promise<void> => {
      try {
        if (await addCard(where, text ? { text } : {}, gather)) added.push(label);
      } catch (err) {
        failed.push(`${label} (${err instanceof Error ? err.message : String(err)})`);
      }
    };
    if (pending.opening) await card("start", "abertura");
    if (pending.closing) await card("end", "encerramento", pending.closingText);
    if (useProject.getState().project?.id !== projectId) return;
    useProject.getState().commit((p) => {
      const { pendingStart: _done, ...rest } = changes.reduce((q, fn) => fn(q), p);
      const bed = pending.music ? musicBed(rest, pending.music) : [];
      return { ...rest, clips: [...rest.clips, ...bed] };
    });
    if (pending.music) added.push("música");
  } finally {
    running.delete(projectId);
  }
  const list =
    added.length > 1 ? `${added.slice(0, -1).join(", ")} e ${added.at(-1)}` : (added[0] ?? "");
  useApp
    .getState()
    .toast(
      failed.length
        ? `Não foi possível pôr: ${failed.join(", ")}.`
        : `O modelo do curso completou a aula: ${list}. Ctrl+Z tira.`,
      failed.length ? "error" : "success",
    );
}

// The first media of a lesson started from a course template completes it.
useProject.subscribe((s, prev) => {
  const p = s.project;
  const before = prev.project;
  if (!p?.pendingStart || !before || before.id !== p.id || p === before) return;
  if (hasLessonMedia(before) || !hasLessonMedia(p)) return;
  void completeStart(p.id);
});
