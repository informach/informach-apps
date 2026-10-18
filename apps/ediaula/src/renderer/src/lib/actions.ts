import { closeCommonGaps, cutTargets } from "@shared/cleanup";
import { type ReframeMode, reframeProject } from "@shared/compose";
import { insertClips } from "@shared/ripple";
import {
  clipsFrom,
  closeGaps,
  makeClip,
  moveTrack,
  newId,
  newTrackName,
  placeClips,
  rippleDelete,
  splitAt,
  toFrame,
  trackAccepts,
  trackEnd,
} from "@shared/timeline";
import type { Asset, Clip, Project, ProjectSettings, Track } from "@shared/types";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { type Commit, personCommit, useProject, waitForDraft } from "@/state/project";
import { importMedia } from "./importMedia";
import { confirmLeave } from "./leaveGuard";
import { checkAssets } from "./relink";
import { cutRangesInteractive } from "./transcripts";

const lockedTracks = (p: Project): Set<string> =>
  new Set(p.tracks.filter((t) => t.locked).map((t) => t.id));

/**
 * Where an asset goes when it is not dropped on a track: sound on the lowest sound track, the
 * lesson's picture on the lowest picture track, avatars on the top one (in front of the lesson).
 * Any track can hold anything; this is only the starting point.
 */
export function defaultTrackFor(p: Project, asset: Asset): Track | undefined {
  const ok = p.tracks.filter((t) => !t.locked);
  if (asset.kind === "audio")
    return [...ok].reverse().find((t) => t.kind === "audio") ?? ok[ok.length - 1];
  const pictures = ok.filter((t) => t.kind === "video");
  const list = pictures.length ? pictures : ok;
  return asset.screen ? list[0] : list[list.length - 1];
}

export const actions = {
  splitAtPlayhead(): void {
    const { project, selection, commit } = useProject.getState();
    if (!project || waitForDraft("dividir clipes")) return;
    const t = usePlayback.getState().time;
    const ids = new Set(selection);
    commit((p) => ({ ...p, clips: splitAt(p.clips, t, ids, lockedTracks(p)) }));
  },

  splitClipAt(clipId: string, t: number): void {
    if (waitForDraft("cortar com a lâmina")) return;
    useProject
      .getState()
      .commit((p) => ({ ...p, clips: splitAt(p.clips, t, new Set([clipId]), lockedTracks(p)) }));
  },

  deleteSelection(ripple: boolean): void {
    const { project, selection, commit } = useProject.getState();
    if (!project || !selection.length) return;
    const locked = lockedTracks(project);
    const ids = new Set(
      project.clips
        .filter((c) => selection.includes(c.id) && !locked.has(c.trackId))
        .map((c) => c.id),
    );
    if (!ids.size) return;
    commit((p) => ({
      ...p,
      clips: ripple ? rippleDelete(p.clips, ids) : p.clips.filter((c) => !ids.has(c.id)),
    }));
    useProject.getState().select([]);
  },

  /**
   * Closes the stretches where no unlocked track has anything, moving every track together so
   * balloons, avatar, zoom and voice stay in sync. Music beds keep playing and end with the lesson.
   */
  closeGaps(): void {
    const { project, commit } = useProject.getState();
    if (!project) return;
    const targets = new Set(project.tracks.filter((t) => !t.locked && !t.music).map((t) => t.id));
    commit((p) => ({ ...p, clips: closeCommonGaps(p, targets, lockedTracks(p)) }));
  },

  /** Packs one track's clips back to back from its first clip (the track's own menu). */
  closeTrackGaps(trackId: string): void {
    const { project, commit } = useProject.getState();
    if (!project || project.tracks.find((t) => t.id === trackId)?.locked) return;
    commit((p) => ({ ...p, clips: closeGaps(p.clips, trackId) }));
  },

  /** Appends assets to the end of their default track. */
  appendAssets(assets: Asset[], commit: Commit = personCommit): void {
    const { project } = useProject.getState();
    if (!project || !assets.length) return;
    commit((p) => {
      let clips = p.clips;
      for (const a of assets) {
        if (a.missing) continue;
        const track = defaultTrackFor(p, a);
        if (!track) continue;
        clips = placeClips(clips, [makeClip(a, track.id, trackEnd(clips, track.id), p.settings)]);
      }
      return { ...p, clips };
    });
  },

  /**
   * Places assets one after another starting at `start` on `track` (or each asset's default
   * track). With `insert` (Ctrl + drop) they go in pushing what comes after on every unlocked
   * track text cuts reach and on the tracks they go to (insertClips); otherwise they cover what
   * is under them.
   */
  placeAssets(assets: Asset[], track: Track | undefined, start: number, insert = false): void {
    const { commit, project } = useProject.getState();
    if (!project || !assets.length || waitForDraft("colocar mídia na timeline")) return;
    commit((p) => {
      const placed: Clip[] = [];
      // The timeline already put `start` on a frame, or exactly on the edge it snapped to.
      let cursor = start;
      for (const a of assets) {
        const target = track && trackAccepts(track, a) ? track : defaultTrackFor(p, a);
        if (!target) continue;
        const clip = makeClip(a, target.id, cursor, p.settings);
        placed.push(clip);
        cursor += clip.duration;
      }
      if (insert && placed.length)
        return { ...p, clips: insertClips(p, cutTargets(p), placed, placed[0].start) };
      let clips = p.clips;
      for (const clip of placed) clips = placeClips(clips, [clip]);
      return { ...p, clips };
    });
  },

  /**
   * Removes the interval marked on the ruler from every track text cuts reach (cutTargets) and
   * pulls what comes after left, keeping them in sync; a music bed keeps playing and ends with
   * the lesson, locked tracks stay as they are. One undo step.
   */
  rippleDeleteInterval(): boolean {
    const { project } = useProject.getState();
    const interval = useApp.getState().interval;
    if (!project || !interval || waitForDraft("excluir o intervalo")) return false;
    const fps = project.settings.fps;
    const start = toFrame(interval.start, fps);
    const end = toFrame(interval.end, fps);
    if (end - start <= 1e-6 || !cutTargets(project).size) return false;
    // The same cut as the transcript's: a protected passage refuses it with a toast.
    const done = cutRangesInteractive([[start, end]]);
    if (done) {
      useApp.getState().set({ interval: null });
      playback.seek(start);
    }
    return done;
  },

  /** The track moved to position `to` (0 = top); one undo step. */
  moveTrack(id: string, to: number): void {
    const { project, commit } = useProject.getState();
    if (!project || waitForDraft("mudar a ordem das faixas")) return;
    const next = moveTrack(project.tracks, id, to);
    if (next !== project.tracks) commit((p) => ({ ...p, tracks: moveTrack(p.tracks, id, to) }));
  },

  /** Selects clips starting at the playhead or after it, on one track or on every track. */
  selectFromPlayhead(trackId?: string): void {
    const { project, select } = useProject.getState();
    if (!project) return;
    const locked = lockedTracks(project);
    const at = usePlayback.getState().time;
    select(
      clipsFrom(project.clips, at, trackId)
        .filter((c) => !locked.has(c.trackId))
        .map((c) => c.id),
    );
  },

  /** Selects every clip of a track. */
  selectTrack(trackId: string): void {
    const { project, select } = useProject.getState();
    if (!project || lockedTracks(project).has(trackId)) return;
    select(project.clips.filter((c) => c.trackId === trackId).map((c) => c.id));
  },

  /** Solo of a track for listening (app state only, never in the lesson). */
  toggleSolo(trackId: string): void {
    const { solo, set } = useApp.getState();
    set({
      solo: solo.includes(trackId) ? solo.filter((id) => id !== trackId) : [...solo, trackId],
    });
  },

  /** Another format for the lesson (Mudar formato), every picture remapped; one undo step. */
  reframe(settings: ProjectSettings, mode: ReframeMode): boolean {
    if (waitForDraft("mudar o formato")) return false;
    return useProject.getState().commit((p) => reframeProject(p, settings, mode));
  },

  async importDialog(): Promise<Asset[]> {
    const paths = await window.api.pickMedia();
    return paths.length ? importMedia(paths) : [];
  },

  addTrack(kind: Track["kind"]): void {
    useProject.getState().commit((p) => {
      const track: Track = {
        id: newId("t"),
        kind,
        name: newTrackName(p.tracks),
        muted: false,
        hidden: false,
        locked: false,
      };
      // New video tracks go on top of the stack, new audio tracks at the bottom.
      return { ...p, tracks: kind === "video" ? [track, ...p.tracks] : [...p.tracks, track] };
    });
  },

  updateTrack(id: string, changes: Partial<Track>): void {
    useProject.getState().commit((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id === id ? { ...t, ...changes } : t)),
    }));
  },

  removeTrack(id: string): void {
    useProject.getState().commit((p) => ({
      ...p,
      tracks: p.tracks.filter((t) => t.id !== id),
      clips: p.clips.filter((c) => c.trackId !== id),
    }));
  },

  removeAsset(id: string): void {
    useProject.getState().commit((p) => ({
      ...p,
      assets: p.assets.filter((a) => a.id !== id),
      clips: p.clips.filter((c) => c.assetId !== id),
    }));
  },

  async openProject(path: string): Promise<void> {
    const { toast, set } = useApp.getState();
    if (!(await confirmLeave())) return;
    try {
      const project = await window.api.openProject(path);
      playback.pause();
      usePlayback.setState({ time: 0 });
      useProject.getState().load(path, project);
      // Files gone since the lesson was last open are marked before the editor shows it, so the
      // preview never asks for one of them.
      const failed = await checkAssets().then(
        () => null,
        (err: unknown) => err,
      );
      set({ screen: "editor", exportOpen: false, tool: "select" });
      if (failed)
        toast(
          `Não foi possível conferir as mídias da aula: ${failed instanceof Error ? failed.message : String(failed)}`,
          "error",
        );
    } catch (err) {
      toast(`Não foi possível abrir o projeto: ${(err as Error).message}`, "error");
    }
  },

  async goHome(): Promise<void> {
    playback.pause();
    if (!(await confirmLeave())) return;
    useProject.getState().close();
    useApp.getState().set({ screen: "home", exportOpen: false });
  },
};
