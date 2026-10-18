import type { KeyOnScreen } from "@shared/captions";
import type { CursorData } from "@shared/cursorData";
import { keyPills } from "@shared/recording";
import { clipEnd, sourceEnd, timelineAt } from "@shared/timeline";
import type { Project } from "@shared/types";
import { useEffect, useState } from "react";
import { cursorFxOf, loadCursorData } from "@/editor/CursorLayer";

/**
 * Shortcut keys pressed while recording, placed on the timeline through the clips that show
 * them (cuts drop the keys of removed passages).
 */
export async function timelineKeys(project: Project): Promise<KeyOnScreen[]> {
  const out: KeyOnScreen[] = [];
  for (const asset of project.assets) {
    if (!asset.cursor || cursorFxOf(asset).keys === false) continue;
    const clips = project.clips.filter((c) => c.assetId === asset.id);
    if (!clips.length || asset.cursorMissing) continue;
    let data: CursorData;
    try {
      data = await loadCursorData(asset.cursor);
    } catch (err) {
      // Without its cursor data the recording shows no keys; the library offers to reconnect it.
      console.warn(`[keys] the keys of ${asset.name} are not shown:`, err);
      continue;
    }
    if (!data.keys?.length) continue;
    for (const pill of keyPills(data.keys))
      for (const c of clips) {
        if (pill.start < c.in || pill.start >= sourceEnd(c)) continue;
        const start = timelineAt(c, pill.start);
        out.push({ start, end: Math.min(clipEnd(c), timelineAt(c, pill.end)), label: pill.label });
      }
  }
  return out.sort((a, b) => a.start - b.start);
}

export function useTimelineKeys(project: Project | null): KeyOnScreen[] {
  const [keys, setKeys] = useState<KeyOnScreen[]>([]);
  useEffect(() => {
    let alive = true;
    if (!project) return setKeys([]);
    void timelineKeys(project).then((k) => alive && setKeys(k));
    return () => {
      alive = false;
    };
  }, [project]);
  return keys;
}
