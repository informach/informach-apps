import { applySetup, type CourseSetup } from "@shared/courseSetup";
import { newId, projectDuration } from "@shared/timeline";
import type { Clip, Project } from "@shared/types";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { importMedia } from "./importMedia";
import { addTemplate } from "./templates";

/**
 * A new lesson started from its course's template (shared/courseSetup.ts). The tracks, palette,
 * captions and ducking are its starting state (not an edit to undo); the music joins the
 * library right away. When the first media reaches the timeline, the opening and closing cards
 * go in (the opening pushes the lesson forward) and the music is laid under all of it, as one
 * Ctrl+Z.
 */
export async function startFromSetup(setup: CourseSetup): Promise<void> {
  const open = useProject.getState().project;
  if (!open) return;
  const { project, musicTrack } = applySetup(open, setup);
  useProject.getState().patch(() => project);
  const music = setup.audio?.music;
  if (music && musicTrack) {
    const [asset] = await importMedia([music.path]);
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
          `A música do modelo (${music.name}) não foi encontrada. A aula começa sem ela.`,
          "info",
        );
  }
  await useProject.getState().saveNow();
}

/** Media on the timeline that is the lesson itself (not the editor's pictures nor the music). */
function hasMedia(p: Project): boolean {
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  const music = p.pendingStart?.music?.assetId;
  return p.clips.some((c) => {
    const a = assets.get(c.assetId);
    return !!a && !a.generated && a.id !== music;
  });
}

const running = new Set<string>();

/** The music bed from 0:00 to the end of the lesson, repeated, with a fade at both ends. */
function musicClips(
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

async function completeStart(projectId: string): Promise<void> {
  const state = useProject.getState();
  const pending = state.project?.id === projectId ? state.project.pendingStart : undefined;
  if (!pending || running.has(projectId)) return;
  running.add(projectId);
  state.beginGroup();
  const failed: string[] = [];
  try {
    if (pending.opening)
      await addTemplate("opening", {}, 0).catch((err: unknown) => {
        failed.push(`abertura (${err instanceof Error ? err.message : String(err)})`);
      });
    const now = useProject.getState().project;
    if (pending.closing && now)
      await addTemplate("closing", {}, projectDuration(now)).catch((err: unknown) => {
        failed.push(`encerramento (${err instanceof Error ? err.message : String(err)})`);
      });
    if (useProject.getState().project?.id === projectId)
      useProject.getState().commit((p) => {
        const { pendingStart: _done, ...rest } = p;
        const bed = pending.music ? musicClips(p, pending.music) : [];
        return { ...rest, clips: [...p.clips, ...bed] };
      });
  } finally {
    useProject.getState().endGroup();
    running.delete(projectId);
  }
  const added = [
    pending.opening && "abertura",
    pending.closing && "encerramento",
    pending.music && "música",
  ].filter((x): x is string => !!x);
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
  if (hasMedia(before) || !hasMedia(p)) return;
  void completeStart(p.id);
});
