import { relinkIn, restoreSnapshot } from "@shared/history";
import type { Asset, Project } from "@shared/types";
import { create } from "zustand";
import { useApp } from "./app";

const HISTORY_LIMIT = 150;
const AUTOSAVE_DELAY = 1200;

export type SaveState = "saved" | "pending" | "saving" | "error";

interface ProjectStore {
  project: Project | null;
  path: string | null;
  past: Project[];
  future: Project[];
  saveState: SaveState;
  /** The last save failure; stays until a save succeeds. */
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
  /**
   * Change that should not enter the undo history (e.g. a thumbnail finishing). Undo and redo
   * keep the media fields listed in ASSET_RUNTIME_FIELDS (shared/history.ts) as they are now.
   */
  patch(fn: (p: Project) => Project): void;
  patchAsset(id: string, changes: Partial<Asset>): void;
  /** The media file was found elsewhere: the new path replaces the old one in the whole history. */
  relinkAsset(id: string, changes: Pick<Asset, "path" | "size">): void;
  undo(): void;
  redo(): void;
  select(ids: string[]): void;
  /** Saves the current state; resolves false when it could not be written. */
  saveNow(): Promise<boolean>;
  /** Writes what is pending: cancels the autosave timer and waits for a save in flight. */
  flush(): Promise<boolean>;
  /** Saves the project at a path the user picks and goes on editing that copy. */
  saveCopyAs(): Promise<boolean>;
  beginGroup(): void;
  endGroup(): void;
}

let timer: ReturnType<typeof setTimeout> | undefined;
/** The state last written to `path`. */
let lastSaved: Project | null = null;
/** Saves run one after another, so the latest state is always the last one written. */
let inFlight: Promise<boolean> | null = null;

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

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

  load: (path, project) => {
    clearTimeout(timer);
    set({
      path,
      project,
      past: [],
      future: [],
      selection: [],
      saveState: "saved",
      saveError: undefined,
    });
  },
  close: () => {
    clearTimeout(timer);
    set({
      project: null,
      path: null,
      past: [],
      future: [],
      selection: [],
      saveState: "saved",
      saveError: undefined,
    });
  },

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
    set({ project: fn(project) });
  },

  patchAsset: (id, changes) =>
    get().patch((p) => ({
      ...p,
      assets: p.assets.map((a) => (a.id === id ? { ...a, ...changes } : a)),
    })),

  relinkAsset: (id, changes) => {
    const { project, past, future } = get();
    const old = project?.assets.find((a) => a.id === id);
    if (!project || !old) return;
    const relink = (p: Project): Project => relinkIn(p, id, old.path, changes);
    set({ project: relink(project), past: past.map(relink), future: future.map(relink) });
  },

  undo: () => {
    const { past, project, future } = get();
    if (!past.length || !project) return;
    set({
      project: restoreSnapshot(past[past.length - 1], project, Date.now()),
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
      project: restoreSnapshot(future[0], project, Date.now()),
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

  select: (ids) => {
    set({ selection: ids });
    // The last selection made is the one Delete acts on: picking clips drops selected words.
    if (ids.length && useApp.getState().textCut) useApp.getState().set({ textCut: null });
  },

  saveNow: () => {
    clearTimeout(timer);
    const run = async (): Promise<boolean> => {
      const { project, path } = get();
      if (!project || !path) return true;
      if (project === lastSaved) {
        if (get().saveState !== "saved" || get().saveError)
          set({ saveState: "saved", saveError: undefined });
        return true;
      }
      set({ saveState: "saving" });
      try {
        await window.api.saveProject(path, project);
        if (get().path !== path) return true;
        lastSaved = project;
        set(
          get().project === project
            ? { saveState: "saved", saveError: undefined }
            : { saveState: "pending", saveError: undefined },
        );
        return true;
      } catch (err) {
        if (get().path === path) set({ saveState: "error", saveError: message(err) });
        return false;
      }
    };
    // `run` never rejects, so the chain always moves on to the next save.
    const next = (inFlight ?? Promise.resolve(true)).then(run);
    inFlight = next;
    void next.then(() => {
      if (inFlight === next) inFlight = null;
    });
    return next;
  },

  flush: () => get().saveNow(),

  saveCopyAs: async () => {
    const { project } = get();
    if (!project) return false;
    const target = await window.api.pickProjectCopyPath(`${project.name} (cópia)`);
    if (!target) return false;
    try {
      await window.api.saveProject(target, project);
    } catch (err) {
      set({ saveState: "error", saveError: message(err) });
      return false;
    }
    // The original location is the one failing: autosave goes on in the copy.
    clearTimeout(timer);
    const current = get().project === project;
    set({ path: target, saveState: current ? "saved" : "pending", saveError: undefined });
    lastSaved = project;
    if (!current) void get().saveNow();
    useApp.getState().toast(`Cópia salva em ${target}. A edição continua nela.`, "success");
    return true;
  },
}));

/** True while some change is not on disk yet (or is being written). */
export const hasUnsavedWork = (): boolean => {
  const { project } = useProject.getState();
  return !!project && (project !== lastSaved || inFlight !== null);
};

// Autosave shortly after every change. A failure stays on screen until a save succeeds.
useProject.subscribe((s, prev) => {
  if (s.path !== prev.path) lastSaved = s.project;
  if (!s.project || !s.path || s.project === prev.project || s.project === lastSaved) return;
  if (s.saveState !== "pending" && s.saveState !== "error")
    useProject.setState({ saveState: "pending" });
  clearTimeout(timer);
  timer = setTimeout(() => void useProject.getState().saveNow(), AUTOSAVE_DELAY);
});

export const assetMap = (p: Project | null): Map<string, Asset> =>
  new Map((p?.assets ?? []).map((a) => [a.id, a]));
