import {
  type CopiedProps,
  groupApplies,
  type PropGroup,
  pasteAnnotationStyle,
  pasteClipProps,
} from "@shared/clipProps";
import { setClipSpeed } from "@shared/timeline";
import type { Clip, Project } from "@shared/types";
import { updateAnnotation } from "@/lib/annotations";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";

/** Properties copied with "Copiar propriedades", kept while the app is open. */
let copied: CopiedProps | null = null;

export const copiedProps = (): CopiedProps | null => copied;

export function targetOf(
  p: Project,
  c: Clip,
): { clip: Clip; kind: "video" | "audio" | "image"; hasAudio: boolean } {
  const a = p.assets.find((x) => x.id === c.assetId);
  return { clip: c, kind: a?.kind ?? "video", hasAudio: !!a?.hasAudio };
}

export function copyProps(clipId: string): void {
  const p = useProject.getState().project;
  const c = p?.clips.find((x) => x.id === clipId);
  if (!p || !c) return;
  const a = p.assets.find((x) => x.id === c.assetId);
  copied = {
    clip: structuredClone(c),
    kind: a?.kind ?? "video",
    hasAudio: !!a?.hasAudio,
    key: a?.key ? { ...a.key } : undefined,
    name: c.annotation ? "a anotação" : (a?.name ?? "o clipe"),
  };
  useApp
    .getState()
    .toast("Propriedades copiadas. Clique direito em outro item › Colar propriedades.", "success");
}

/** Opens the paste dialog for the selection (or the given clips). */
export function askPasteProps(ids?: string[]): void {
  const sel = ids ?? useProject.getState().selection;
  if (!copied) {
    void useApp
      .getState()
      .toast(
        "Copie as propriedades de um clipe antes (clique direito › Copiar propriedades).",
        "info",
      );
    return;
  }
  if (!sel.length) {
    void useApp.getState().toast("Selecione os clipes que vão receber as propriedades.", "info");
    return;
  }
  useApp.getState().set({ pastePropsClips: sel });
}

/**
 * Applies the chosen groups of the copied properties to the clips. All of it is one undo step,
 * including annotations redrawn with the new look and the background removal of their media.
 */
export async function pasteProps(ids: string[], groups: Set<PropGroup>): Promise<number> {
  const src = copied;
  const p = useProject.getState().project;
  if (!src || !p) return 0;
  const locked = new Set(p.tracks.filter((t) => t.locked).map((t) => t.id));
  const targets = p.clips.filter(
    (c) => ids.includes(c.id) && c.id !== src.clip.id && !locked.has(c.trackId),
  );
  if (!targets.length) return 0;
  const store = useProject.getState();
  store.beginGroup();
  try {
    store.commit((q) => ({
      ...q,
      clips: q.clips.map((c) =>
        targets.some((t) => t.id === c.id) ? pasteClipProps(targetOf(q, c), src.clip, groups) : c,
      ),
    }));
    if (groups.has("speed")) {
      const s = src.clip.speed ?? 1;
      // Latest first, so moving what follows one clip does not shift the ones still to change.
      const timed = targets
        .filter((c) => groupApplies("speed", targetOf(p, c)))
        .sort((a, b) => b.start - a.start);
      if (timed.length)
        store.commit((q) => ({
          ...q,
          clips: timed.reduce((clips, c) => setClipSpeed(clips, c.id, s, true), q.clips),
        }));
    }
    if (groups.has("background")) {
      const media = new Set(
        targets.filter((c) => groupApplies("background", targetOf(p, c))).map((c) => c.assetId),
      );
      if (media.size)
        store.commit((q) => ({
          ...q,
          assets: q.assets.map((a) =>
            media.has(a.id) ? { ...a, key: src.key ? { ...src.key } : undefined } : a,
          ),
        }));
    }
    if (groups.has("style") && src.clip.annotation)
      for (const c of targets) {
        const now = useProject.getState().project?.clips.find((x) => x.id === c.id);
        if (now?.annotation)
          await updateAnnotation(c.id, pasteAnnotationStyle(now.annotation, src.clip.annotation));
      }
  } finally {
    useProject.getState().endGroup();
  }
  return targets.length;
}
