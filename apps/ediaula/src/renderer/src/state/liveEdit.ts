import { DEFAULT_TRANSFORM, type Transform } from "@shared/compose";
import type { Clip } from "@shared/types";
import { create } from "zustand";

/**
 * A property being dragged in the panel (a slider held down): the preview shows it on the
 * clips at once, and only letting go writes it to the lesson (one undo step).
 */
interface LiveEdit {
  ids: string[];
  patch: Partial<Transform>;
}

export const useLiveEdit = create<{ live: LiveEdit | null }>(() => ({ live: null }));

export const liveEdit = {
  show(ids: string[], patch: Partial<Transform>): void {
    useLiveEdit.setState({ live: { ids, patch } });
  },
  clear(): void {
    if (useLiveEdit.getState().live) useLiveEdit.setState({ live: null });
  },
};

/** A clip's transform with the property being dragged, if it is one of the clips. */
export function liveTransform(c: Pick<Clip, "id" | "transform">, live: LiveEdit | null): Transform {
  const base = c.transform ?? DEFAULT_TRANSFORM;
  return live?.ids.includes(c.id) ? { ...base, ...live.patch } : base;
}
