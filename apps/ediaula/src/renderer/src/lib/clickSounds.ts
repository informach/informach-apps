import type { SoundEvent } from "@shared/autoSounds";
import { clickEvents } from "@shared/clickEvents";
import type { CursorData } from "@shared/cursorData";
import type { Project } from "@shared/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadCursorData } from "@/editor/CursorLayer";

/**
 * The automatic click sounds of the open lesson (shared/clickEvents.ts) in the renderer: the
 * saved clicks of the recordings that have the sound on are read (cached by CursorLayer), and the
 * list is worked out on the lesson as it is. The preview plays it, the timeline shows it on the
 * track "Cliques", the export mixes it and the AI tools count it.
 */

/** Media whose clicks can sound: a screen recording with the click sound on somewhere. */
const sounding = (p: Pick<Project, "assets">) =>
  p.assets.filter(
    (a) =>
      !!a.cursor &&
      !a.cursorMissing &&
      (!!a.cursorFx?.clickSound || !!a.cursorFx?.ranges?.some((r) => r.fx.clickSound)),
  );

/** The saved clicks of every recording that can sound; a file that cannot be read is skipped. */
export async function loadClickCursors(
  p: Pick<Project, "assets">,
): Promise<Map<string, CursorData>> {
  const out = new Map<string, CursorData>();
  await Promise.all(
    sounding(p).map(async (a) => {
      try {
        out.set(a.id, await loadCursorData(a.cursor as string));
      } catch {
        // Its pointer data is gone: no clicks to sound for it.
      }
    }),
  );
  return out;
}

/** Every automatic click of `p`, on the lesson's clock. */
export async function loadClickEvents(p: Project): Promise<SoundEvent[]> {
  return clickEvents(p, await loadClickCursors(p));
}

/** The automatic clicks of `p`, kept up to date with it (the pointer data is read once). */
export function useClickEvents(p: Project | null): SoundEvent[] {
  const key = p
    ? sounding(p)
        .map((a) => `${a.id}:${a.cursor}`)
        .join("|")
    : "";
  const [cursors, setCursors] = useState<{ key: string; map: Map<string, CursorData> }>({
    key: "",
    map: new Map(),
  });
  // The pointer data is read again only when the recordings that can sound change; the rest of
  // the lesson changes the list below without reading anything.
  const latest = useRef(p);
  latest.current = p;
  useEffect(() => {
    const project = latest.current;
    if (!project || !key) return;
    let alive = true;
    void loadClickCursors(project).then((map) => {
      if (alive) setCursors({ key, map });
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return useMemo(
    () => (p && key && cursors.key === key ? clickEvents(p, cursors.map) : []),
    [p, key, cursors],
  );
}
