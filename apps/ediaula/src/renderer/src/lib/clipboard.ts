import { withGroups } from "@shared/groups";
import { pasteClips } from "@shared/timeline";
import type { Asset, Clip } from "@shared/types";
import { actions } from "@/lib/actions";
import { useApp } from "@/state/app";
import { usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";

/** Clips copied with Ctrl+C (and their media), kept while the app is open, across projects. */
let copied: { clips: Clip[]; assets: Asset[] } | null = null;

export function copySelection(): number {
  const { project, selection } = useProject.getState();
  if (!project || !selection.length) return 0;
  // A clip of a group is copied with its whole group.
  const picked = new Set(withGroups(project.clips, selection));
  const clips = project.clips.filter((c) => picked.has(c.id));
  if (!clips.length) return 0;
  const used = new Set(clips.map((c) => c.assetId));
  copied = {
    clips: structuredClone(clips),
    assets: structuredClone(project.assets.filter((a) => used.has(a.id))),
  };
  return clips.length;
}

export function cutSelection(): void {
  if (copySelection()) actions.deleteSelection(false);
}

/** Pastes at the playhead, without covering anything (see pasteClips); the pasted clips end up selected. One undo step. */
export function paste(): void {
  const project = useProject.getState().project;
  if (!project || !copied) return;
  const { clips: source, assets } = copied;
  const at = usePlayback.getState().time;
  let ids: string[] = [];
  useProject.getState().commit((p) => {
    const have = new Set(p.assets.map((a) => a.id));
    const r = pasteClips(p.tracks, p.clips, source, at);
    ids = r.ids;
    return {
      ...p,
      tracks: r.tracks,
      clips: r.clips,
      assets: [...p.assets, ...assets.filter((a) => !have.has(a.id))],
    };
  });
  useProject.getState().select(ids);
  useApp
    .getState()
    .toast(
      ids.length === 1 ? "Colado no cursor." : `${ids.length} itens colados no cursor.`,
      "success",
    );
}
