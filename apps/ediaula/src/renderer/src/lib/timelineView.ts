import { projectDuration } from "@shared/timeline";
import { useApp, ZOOM_MAX, ZOOM_MIN } from "@/state/app";
import { useProject } from "@/state/project";

/** Live geometry of the timeline viewport, shared with zoom commands outside the component. */
export const timelineView: { width: number; scrollTo?: (x: number) => void } = { width: 1200 };

export function zoomBy(factor: number): void {
  const { zoom, set } = useApp.getState();
  set({ zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor)) });
}

export function zoomToFit(): void {
  const project = useProject.getState().project;
  const d = project ? projectDuration(project) : 0;
  if (d <= 0) return;
  useApp
    .getState()
    .set({ zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (timelineView.width - 60) / d)) });
  timelineView.scrollTo?.(0);
}
