import type { Asset, Project } from "@shared/types";
import { create } from "zustand";

const HISTORY_LIMIT = 150;
const AUTOSAVE_DELAY = 1200;

export type SaveState = "saved" | "pending" | "saving" | "error";

interface ProjectStore {
  project: Project | null;
  path: string | null;
  past: Project[];
  future: Project[];
  saveState: SaveState;
  saveError?: string;
  selection: string[];
  /** Bumped on every edit, undo and redo; AI tools use it to detect a stale view of the project. */
  revision: number;
  /** While > 0, commits merge into a single undo step (an AI command). */
  groupDepth: number;
  groupOpen: boolean;

  load(path: string, project: Project): void;
  close(): void;
  /** Undoable change. */
  commit(fn: (p: Project) => Project): void;
  /** Change that should not enter the undo history (e.g. a thumbnail finishing). */
  patch(fn: (p: Project) => Project): void;
  patchAsset(id: string, changes: Partial<Asset>): void;
  undo(): void;
  redo(): void;
  select(ids: string[]): void;
  saveNow(): Promise<void>;
  beginGroup(): void;
  endGroup(): void;
}

export const useProject = create<ProjectStore>((set, get) => ({
  project: null,
  path: null,
  past: [],
  future: [],
  saveState: "saved",
  selection: [],
  revision: 0,
  groupDepth: 0,
  groupOpen: false,

  load: (path, project) =>
    set({
      path,
      project,
      past: [],
      future: [],
      selection: [],
      saveState: "saved",
      saveError: undefined,
    }),
  close: () => set({ project: null, path: null, past: [], future: [], selection: [] }),

  commit: (fn) => {
    const { project, past } = get();
    if (!project) return;
    const next = { ...fn(project), updatedAt: Date.now() };
    const ids = new Set(next.clips.map((c) => c.id));
    // Inside a group only the first commit records an undo point.
    const merge = get().groupDepth > 0 && get().groupOpen;
    set({
      project: next,
      past: merge ? past : [...past, project].slice(-HISTORY_LIMIT),
      future: [],
      selection: get().selection.filter((id) => ids.has(id)),
      revision: get().revision + 1,
      groupOpen: get().groupDepth > 0,
    });
  },

  patch: (fn) => {
    const { project } = get();
    if (!project) return;
    const next = fn(project);
    // Keep undo history consistent with asset metadata that arrived later.
    const sync = (p: Project): Project => ({
      ...p,
      assets: p.assets.map((a) => next.assets.find((b) => b.id === a.id) ?? a),
    });
    set({ project: next, past: get().past.map(sync), future: get().future.map(sync) });
  },

  patchAsset: (id, changes) =>
    get().patch((p) => ({
      ...p,
      assets: p.assets.map((a) => (a.id === id ? { ...a, ...changes } : a)),
    })),

  undo: () => {
    const { past, project, future } = get();
    if (!past.length || !project) return;
    set({
      project: past[past.length - 1],
      past: past.slice(0, -1),
      future: [project, ...future],
      revision: get().revision + 1,
      groupOpen: false,
    });
  },
  redo: () => {
    const { past, project, future } = get();
    if (!future.length || !project) return;
    set({
      project: future[0],
      past: [...past, project],
      future: future.slice(1),
      revision: get().revision + 1,
      groupOpen: false,
    });
  },

  beginGroup: () => set({ groupDepth: get().groupDepth + 1 }),
  endGroup: () => {
    const depth = Math.max(0, get().groupDepth - 1);
    set({ groupDepth: depth, groupOpen: depth > 0 && get().groupOpen });
  },

  select: (ids) => set({ selection: ids }),

  saveNow: async () => {
    const { project, path } = get();
    if (!project || !path) return;
    clearTimeout(timer);
    set({ saveState: "saving" });
    try {
      await window.api.saveProject(path, project);
      lastSaved = project;
      if (get().project === project) set({ saveState: "saved", saveError: undefined });
    } catch (err) {
      set({ saveState: "error", saveError: (err as Error).message });
    }
  },
}));

let timer: ReturnType<typeof setTimeout> | undefined;
let lastSaved: Project | null = null;

// Autosave shortly after every change.
useProject.subscribe((s, prev) => {
  if (s.path !== prev.path) lastSaved = s.project;
  if (!s.project || !s.path || s.project === prev.project || s.project === lastSaved) return;
  if (s.saveState !== "pending") useProject.setState({ saveState: "pending" });
  clearTimeout(timer);
  timer = setTimeout(() => void useProject.getState().saveNow(), AUTOSAVE_DELAY);
});

export const assetMap = (p: Project | null): Map<string, Asset> =>
  new Map((p?.assets ?? []).map((a) => [a.id, a]));
