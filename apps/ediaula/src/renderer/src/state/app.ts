import type { AppInfo, JobProgress } from "@shared/types";
import { create } from "zustand";

export type Tool = "select" | "cut";
export type SideTab = "transcript" | "script" | "prepare" | "assistant" | "properties";
export type LibraryFilter = "all" | "video" | "audio" | "image";

export interface Job {
  id: string;
  label: string;
  ratio: number;
  /** Exports: where it is, how many segments are done (and reused), what is happening. */
  phase?: JobProgress["phase"];
  segments?: JobProgress["segments"];
  message?: string;
}

export interface CleanupMark {
  start: number;
  end: number;
  kind: "filler" | "silence" | "repeat";
}

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "error" | "success";
}

export type LeftPanel =
  | "media"
  | "annotations"
  | "templates"
  | "transitions"
  | "motions"
  | "audio"
  | "captions"
  | "zoom";

interface AppStore {
  screen: "home" | "editor";
  info: AppInfo | null;
  /** Timeline zoom in pixels per second. */
  zoom: number;
  tool: Tool;
  snapping: boolean;
  sideTab: SideTab;
  libraryFilter: LibraryFilter;
  /** What the left panel shows. */
  leftPanel: LeftPanel;
  exportOpen: boolean;
  /** Clips whose speed is being changed (the speed dialog is open). */
  speedClips: string[] | null;
  extendClip: string | null;
  cursorClip: string | null;
  /** Clips receiving copied properties (the paste-properties dialog is open). */
  pastePropsClips: string[] | null;
  settingsOpen: boolean;
  /** Mudar formato is open (the lesson's frame size). */
  reframeOpen: boolean;
  jobs: Record<string, Job>;
  toasts: Toast[];
  /** Pending automatic cuts, drawn on the timeline while the transcript panel is open. */
  cleanupMarks: CleanupMark[];
  /** Timeline range of the words selected in the transcript (Delete cuts it). */
  textCut: [number, number] | null;
  /** The cut selected on the timeline (id of the clip that starts there), for transitions. */
  junction: string | null;
  /** The interval marked on the timeline ruler (narrate, record again, delete on every track). */
  interval: { start: number; end: number } | null;
  /**
   * Tracks heard alone (solo): only for listening in the editor, never saved in the lesson and
   * never in the export (the export dialog says so while one is on).
   */
  solo: string[];
  set(partial: Partial<AppStore>): void;
  startJob(id: string, label: string): void;
  endJob(id: string): void;
  toast(text: string, tone?: Toast["tone"]): void;
}

let toastId = 0;

export const useApp = create<AppStore>((set, get) => ({
  screen: "home",
  info: null,
  zoom: 40,
  tool: "select",
  snapping: true,
  sideTab: "transcript",
  libraryFilter: "all",
  leftPanel: "media",
  exportOpen: false,
  speedClips: null,
  extendClip: null,
  cursorClip: null,
  pastePropsClips: null,
  settingsOpen: false,
  reframeOpen: false,
  jobs: {},
  toasts: [],
  cleanupMarks: [],
  textCut: null,
  junction: null,
  interval: null,
  solo: [],
  set: (partial) => set(partial),
  startJob: (id, label) => set({ jobs: { ...get().jobs, [id]: { id, label, ratio: 0 } } }),
  endJob: (id) => {
    const jobs = { ...get().jobs };
    delete jobs[id];
    set({ jobs });
  },
  toast: (text, tone = "info") => {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, text, tone }] });
    setTimeout(
      () => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
      tone === "error" ? 7000 : 3500,
    );
  },
}));

export function listenToJobs(): () => void {
  return window.api.onProgress((p: JobProgress) => {
    const job = useApp.getState().jobs[p.id];
    if (job)
      useApp.setState({
        jobs: {
          ...useApp.getState().jobs,
          [p.id]: {
            ...job,
            ratio: p.ratio,
            phase: p.phase ?? job.phase,
            segments: p.segments ?? job.segments,
            message: p.message ?? (p.phase && p.phase !== job.phase ? undefined : job.message),
          },
        },
      });
  });
}

export const ZOOM_MIN = 2;
export const ZOOM_MAX = 400;

/** Whether a track is heard now: not muted, and the one in solo when some track is. */
export const heard = (track: { id: string; muted: boolean }, solo: readonly string[]): boolean =>
  !track.muted && (!solo.length || solo.includes(track.id));
