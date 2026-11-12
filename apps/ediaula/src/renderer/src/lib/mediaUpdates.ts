import { diskChange, watchable } from "@shared/mediaChange";
import { useProject } from "@/state/project";
import { updateMedia } from "./replaceMedia";

/** Media being taken in now: a second look while one runs (it transcribes) leaves it alone. */
const updating = new Set<string>();

/**
 * Media files exported again over the old ones (same name, new content) are taken in by the
 * lesson by themselves: when it opens, when the window comes back and before exporting
 * (lib/relink.ts). The media keeps its name and its clips their edits (replaceMedia.ts
 * updateMedia). A media whose date was never kept (brought in before) only has it written down.
 */
export async function refreshChanged(): Promise<void> {
  const project = useProject.getState().project;
  if (!project) return;
  const assets = project.assets.filter((a) => watchable(a) && !updating.has(a.id));
  if (!assets.length) return;
  const stats = await window.api.statFiles(assets.map((a) => a.path));
  for (const [i, a] of assets.entries()) {
    const stat = stats[i];
    const now = useProject.getState().project;
    const current = now?.assets.find((b) => b.id === a.id);
    // Gone, another lesson, or the media changed meanwhile: judged at the next look.
    if (!stat || now?.id !== project.id || !current || current !== a) continue;
    const change = diskChange(current, stat);
    if (change === "record") useProject.getState().patchAsset(a.id, { mtime: stat.mtime });
    else if (change === "changed") {
      updating.add(a.id);
      try {
        await updateMedia(a.id, true);
      } finally {
        updating.delete(a.id);
      }
    }
  }
}
