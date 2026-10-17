import { closeCommonGaps } from "@shared/cleanup";
import {
  closeGaps,
  makeClip,
  newId,
  newTrackName,
  placeClips,
  rippleDelete,
  splitAt,
  trackAccepts,
  trackEnd,
} from "@shared/timeline";
import type { Asset, Project, Track } from "@shared/types";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { importMedia } from "./importMedia";
import { confirmLeave } from "./leaveGuard";
import { checkAssets } from "./relink";

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
    if (!project) return;
    const t = usePlayback.getState().time;
    const ids = new Set(selection);
    commit((p) => ({ ...p, clips: splitAt(p.clips, t, ids, lockedTracks(p)) }));
  },

  splitClipAt(clipId: string, t: number): void {
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
  appendAssets(assets: Asset[]): void {
    const { commit, project } = useProject.getState();
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

  /** Places assets one after another starting at `start` on `track` (or each asset's default track). */
  placeAssets(assets: Asset[], track: Track | undefined, start: number): void {
    const { commit, project } = useProject.getState();
    if (!project || !assets.length) return;
    commit((p) => {
      let clips = p.clips;
      let cursor = start;
      for (const a of assets) {
        const target = track && trackAccepts(track, a) ? track : defaultTrackFor(p, a);
        if (!target) continue;
        const clip = makeClip(a, target.id, cursor, p.settings);
        clips = placeClips(clips, [clip]);
        cursor += clip.duration;
      }
      return { ...p, clips };
    });
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
      set({ screen: "editor", exportOpen: false, tool: "select" });
      void checkAssets();
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
