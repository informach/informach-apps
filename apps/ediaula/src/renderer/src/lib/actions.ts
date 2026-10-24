import { closeCommonGaps, cutTargets } from "@shared/cleanup";
import { type ReframeMode, reframeProject } from "@shared/compose";
import {
  detachAudio,
  detachProblem,
  groupClips,
  isOneGroup,
  ungroupClips,
  withGroups,
} from "@shared/groups";
import { magneticBlockers, magneticSlot } from "@shared/magnetic";
import { addMarker, type Marker, stepMarker } from "@shared/markers";
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
import { becomesVoice, layoutVoiceImport, voiceTrack } from "@shared/voiceImport";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { type Commit, personCommit, useProject, waitForDraft } from "@/state/project";
import { importMedia } from "./importMedia";
import { confirmLeave } from "./leaveGuard";
import { checkAssets } from "./relink";
import { cutRangesInteractive } from "./transcripts";

/** Says once that the sound brought in became the lesson's voice (and what that opens). */
function voiceToast(count: number): void {
  useApp
    .getState()
    .toast(
      `${count > 1 ? "Os áudios entraram" : "O áudio entrou"} na faixa Voz: é a voz da aula. Já dá para gravar a tela sobre a narração.`,
      "success",
    );
}

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
    if (!project || !selection.length || waitForDraft("excluir clipes")) return;
    const locked = lockedTracks(project);
    // Only what is selected: a click on a grouped clip already selects the whole group, and
    // Alt + click picks one clip of it alone.
    const picked = new Set(selection);
    const ids = new Set(
      project.clips.filter((c) => picked.has(c.id) && !locked.has(c.trackId)).map((c) => c.id),
    );
    if (!ids.size) return;
    commit((p) => ({
      ...p,
      clips: ripple ? rippleDelete(p.clips, ids) : p.clips.filter((c) => !ids.has(c.id)),
    }));
    useProject.getState().select([]);
  },

  /** Ctrl+G: the selected clips (and the groups they are in) become one group. */
  group(): boolean {
    const { project, selection, commit } = useProject.getState();
    if (!project || waitForDraft("agrupar clipes")) return false;
    const locked = lockedTracks(project);
    const ids = project.clips
      .filter((c) => selection.includes(c.id) && !locked.has(c.trackId))
      .map((c) => c.id);
    if (ids.length < 2 || isOneGroup(project.clips, ids)) {
      useApp
        .getState()
        .toast(
          ids.length < 2
            ? "Selecione dois ou mais clipes para agrupar."
            : "Esses clipes já estão no mesmo grupo.",
          "info",
        );
      return false;
    }
    const done = commit((p) => ({ ...p, clips: groupClips(p.clips, ids) }));
    if (done)
      useProject.getState().select(withGroups(useProject.getState().project?.clips ?? [], ids));
    return done;
  },

  /** Ctrl+Shift+G: the groups of the selected clips undone. */
  ungroup(): boolean {
    const { project, selection, commit } = useProject.getState();
    if (!project || waitForDraft("desagrupar clipes")) return false;
    if (!project.clips.some((c) => selection.includes(c.id) && c.groupId)) {
      useApp.getState().toast("Nenhum dos clipes selecionados está num grupo.", "info");
      return false;
    }
    return commit((p) => ({ ...p, clips: ungroupClips(p.clips, selection) }));
  },

  /** Separar áudio: the clip's sound on a track of its own, grouped with the video (J and L cuts). */
  detachAudio(clipId: string): boolean {
    const { project, commit } = useProject.getState();
    if (!project || waitForDraft("separar o áudio")) return false;
    const problem = detachProblem(project, clipId);
    if (problem) {
      useApp.getState().toast(problem, "info");
      return false;
    }
    const done = commit((p) => {
      const again = detachAudio(p, clipId);
      return again ? { ...p, clips: again.clips, tracks: again.tracks } : p;
    });
    if (done)
      useApp
        .getState()
        .toast(
          "O som foi para uma faixa própria, no mesmo grupo do vídeo. Alt + clique seleciona só um deles para os cortes em J e L.",
          "success",
        );
    return done;
  },

  /** M: a marker at the playhead, named after the others; one undo step. */
  addMarker(): void {
    const { project, commit } = useProject.getState();
    if (!project) return;
    const t = toFrame(usePlayback.getState().time, project.settings.fps);
    commit((p) => ({ ...p, markers: addMarker(p.markers ?? [], t) }));
  },

  updateMarker(id: string, changes: Partial<Omit<Marker, "id">>): void {
    useProject.getState().commit((p) => ({
      ...p,
      markers: (p.markers ?? []).map((m) => (m.id === id ? { ...m, ...changes } : m)),
    }));
  },

  removeMarker(id: string): void {
    useProject.getState().commit((p) => {
      const markers = (p.markers ?? []).filter((m) => m.id !== id);
      const next: Project = { ...p, markers };
      if (!markers.length) delete next.markers;
      return next;
    });
  },

  /** Shift+M and Alt+M: to the next marker or the one before. */
  stepMarker(dir: 1 | -1): void {
    const { project } = useProject.getState();
    const m = stepMarker(project?.markers ?? [], usePlayback.getState().time, dir);
    if (m) playback.seek(m.t);
  },

  /**
   * Closes the stretches where no unlocked track has anything, moving every track together so
   * balloons, avatar, zoom and voice stay in sync. Music beds keep playing and end with the lesson.
   */
  closeGaps(): void {
    const { project, commit } = useProject.getState();
    if (!project || waitForDraft("fechar as lacunas")) return;
    const targets = new Set(project.tracks.filter((t) => !t.locked && !t.music).map((t) => t.id));
    commit((p) => ({ ...p, clips: closeCommonGaps(p, targets, lockedTracks(p)) }));
  },

  /** Packs one track's clips back to back from its first clip (the track's own menu). */
  closeTrackGaps(trackId: string): void {
    const { project, commit } = useProject.getState();
    if (!project || project.tracks.find((t) => t.id === trackId)?.locked) return;
    if (waitForDraft("fechar as lacunas da faixa")) return;
    commit((p) => ({ ...p, clips: closeGaps(p.clips, trackId) }));
  },

  /**
   * Appends assets to the end of their default track. In a lesson without a voice, the audio
   * files among them are the voice: they go on the "Voz" track (shared/voiceImport.ts).
   */
  appendAssets(assets: Asset[], commit: Commit = personCommit): void {
    const { project } = useProject.getState();
    if (!project || !assets.length) return;
    let voiced = 0;
    commit((p) => {
      const present = assets.filter((a) => !a.missing);
      const voices = present.filter((a) => becomesVoice(p, a));
      const voice = voices.length ? layoutVoiceImport(p, voices) : null;
      voiced = voice?.placed.length ?? 0;
      const q = voice ? { ...p, tracks: voice.tracks, clips: voice.clips } : p;
      let clips = q.clips;
      for (const a of present) {
        if (voice?.placed.some((c) => c.assetId === a.id)) continue;
        const track = defaultTrackFor(q, a);
        if (!track) continue;
        clips = placeClips(clips, [makeClip(a, track.id, trackEnd(clips, track.id), q.settings)]);
      }
      return { ...q, clips };
    });
    if (voiced) voiceToast(voiced);
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
    let voiced = 0;
    commit((before) => {
      let p = before;
      const placed: Clip[] = [];
      // The timeline already put `start` on a frame, or exactly on the edge it snapped to.
      let cursor = start;
      for (const a of assets) {
        let target = track && trackAccepts(track, a) ? track : defaultTrackFor(p, a);
        // A lesson's first sound is its voice, unless it was put on a sound track on purpose.
        if ((!track || track.kind === "video") && becomesVoice(before, a)) {
          const voice = voiceTrack(p);
          p = { ...p, tracks: voice.tracks };
          target = voice.track;
          voiced++;
        }
        if (!target) continue;
        const clip = makeClip(a, target.id, cursor, p.settings);
        placed.push(clip);
        cursor += clip.duration;
      }
      if (insert && placed.length)
        return { ...p, clips: insertClips(p, cutTargets(p), placed, placed[0].start) };
      let clips = p.clips;
      // On a magnetic track a clip goes in between the others (the commit packs the track).
      const magnetic = new Set(p.tracks.filter((t) => t.magnetic && !t.locked).map((t) => t.id));
      for (const clip of placed)
        clips = magnetic.has(clip.trackId)
          ? [
              ...clips,
              { ...clip, start: Math.max(0, magneticSlot(clips, clip.trackId, clip.start)) },
            ]
          : placeClips(clips, [clip]);
      return { ...p, clips };
    });
    if (voiced) voiceToast(voiced);
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

  /** A magnetic track (its clips back to back from 0:00) or a free one again; one undo step. */
  toggleMagnetic(id: string): void {
    const { project, commit } = useProject.getState();
    const track = project?.tracks.find((t) => t.id === id);
    if (!track || track.locked || waitForDraft("mudar a faixa magnética")) return;
    // Packing would pull a group apart when a member is on a locked track.
    const blockers = track.magnetic || !project ? [] : magneticBlockers(project, id);
    if (blockers.length) {
      useApp
        .getState()
        .toast(
          `Clipes desta faixa estão agrupados com clipes da faixa travada ${blockers.join(", ")}: destrave para a faixa ficar magnética sem separar o grupo.`,
          "info",
        );
      return;
    }
    commit((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id === id ? { ...t, magnetic: !t.magnetic } : t)),
    }));
  },

  /** "Destacar faixa": the other tracks step aside while it sounds; one undo step. */
  toggleSpotlight(id: string): void {
    useProject.getState().commit((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id === id ? { ...t, spotlight: !t.spotlight } : t)),
    }));
  },

  updateTrack(id: string, changes: Partial<Track>): void {
    useProject.getState().commit((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id === id ? { ...t, ...changes } : t)),
    }));
  },

  removeTrack(id: string): void {
    if (waitForDraft("remover a faixa")) return;
    useProject.getState().commit((p) => ({
      ...p,
      tracks: p.tracks.filter((t) => t.id !== id),
      clips: p.clips.filter((c) => c.trackId !== id),
    }));
  },

  removeAsset(id: string): void {
    if (waitForDraft("remover a mídia")) return;
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
