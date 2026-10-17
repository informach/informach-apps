import { isColorFx, previousClip, type Transition, type TransitionKind } from "@shared/transitions";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { activePalette } from "./palettes";

/** A transition as the user picks it; the spinning color wipe takes the lesson palette's colors. */
export function makeTransition(
  kind: TransitionKind,
  duration: number,
  colors?: string[],
): Transition {
  if (!isColorFx(kind)) return { kind, duration };
  return { kind, duration, colors: colors ?? paletteColors() };
}

/** The lesson palette's colors for color transitions: main, creative and accent. */
export function paletteColors(): string[] {
  const r = activePalette(useProject.getState().project).roles;
  return [r.primary, r.creative, r.accent];
}

/** Changes the colors of one cut's color transition. */
export function setTransitionColors(clipId: string, colors: string[]): void {
  useProject.getState().commit((q) => ({
    ...q,
    clips: q.clips.map((c) =>
      c.id === clipId && c.transition ? { ...c, transition: { ...c.transition, colors } } : c,
    ),
  }));
}

/** Data type of a transition dragged from the panel onto a cut. */
export const TRANSITION_DRAG = "application/x-ediaula-transition";

/**
 * Sets (or removes, with null) the transition of one cut: the cut where `clipId` starts.
 * Keeps the cut's duration when only the kind changes. One undo step.
 */
export function setTransition(
  clipId: string,
  kind: TransitionKind | null,
  duration?: number,
): void {
  // Switching between color transitions keeps the colors already chosen for this cut.
  const p = useProject.getState().project;
  const clip = p?.clips.find((c) => c.id === clipId);
  if (!p || !clip || !previousClip(p.clips, clip)) return;
  const next = kind
    ? makeTransition(kind, duration ?? clip.transition?.duration ?? 0.6, clip.transition?.colors)
    : undefined;
  useProject.getState().commit((q) => ({
    ...q,
    clips: q.clips.map((c) => (c.id === clipId ? { ...c, transition: next } : c)),
  }));
  if (!kind) useApp.getState().toast("Transição removida deste corte (Ctrl+Z desfaz).", "info");
}

/** Selects a cut on the timeline and shows the transitions panel. */
export function selectJunction(clipId: string | null): void {
  useApp.getState().set({
    junction: clipId,
    ...(clipId ? { leftPanel: "transitions" as const, textCut: null } : {}),
  });
  if (clipId) useProject.getState().select([]);
}

// Picking clips leaves the selected cut.
useProject.subscribe((s, prev) => {
  if (s.selection !== prev.selection && s.selection.length && useApp.getState().junction)
    useApp.getState().set({ junction: null });
});
