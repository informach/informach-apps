import type { StoredProposal } from "@shared/anchors";
import type { GuidedStore } from "@shared/guidedPlan";
import {
  type AiTurn,
  aiUndoCount,
  closeTurn,
  type History,
  type HistoryEntry,
  pushCommit,
  type RelinkChanges,
  redoSpan,
  redoSteps,
  relinkIn,
  undoSpan,
  undoSteps,
} from "@shared/history";
import { applyItems, type DiffItem, type DraftOp, draftWrite } from "@shared/projectDiff";
import { fileName } from "@shared/relink";
import { newId } from "@shared/timeline";
import type { Asset, Project } from "@shared/types";
import { useMemo } from "react";
import { create } from "zustand";
import { useApp } from "./app";

const HISTORY_LIMIT = 150;
const AUTOSAVE_DELAY = 1200;

export type SaveState = "saved" | "pending" | "saving" | "error";

/**
 * Changes an AI tool or a step of "Preparar aula" would make, waiting for the person: shown in
 * the preview and highlighted on the timeline, accepted or rejected item by item in the review
 * bar, and written into the project in one undo step only when applied (shared/projectDiff.ts).
 * It lives in memory, never in the project file.
 */
export interface Draft {
  id: string;
  projectId: string;
  /** Who made it ("preparar:<etapa>", "modelo", "assistente", "cliente:<grant>"). */
  author: string;
  title: string;
  /** The project when the draft began. */
  base: Project;
  items: DiffItem[];
  /** The edits written into it that changed the structure (shared/projectDiff.ts DraftOp). */
  ops: DraftOp[];
}

interface ProjectStore {
  project: Project | null;
  path: string | null;
  past: Project[];
  future: Project[];
  /** Who made each step in `past` and `future` (shared/history.ts). */
  pastMeta: HistoryEntry[];
  futureMeta: HistoryEntry[];
  saveState: SaveState;
  /** The last save failure; stays until a save succeeds. */
  saveError?: string;
  selection: string[];
  /**
   * Bumped on every edit, undo, redo and project change, from one counter that never goes back:
   * AI tools use it to detect a stale view of the project, even of another project.
   */
  revision: number;
  /** The turn of the chat inside EdiAula in progress, if any. */
  aiTurn: AiTurn | null;
  /** The draft waiting for review, if any (one at a time). */
  draft: Draft | null;

  load(path: string, project: Project): void;
  close(): void;
  /** The open lesson's file was renamed (main/projects.ts renameProject). */
  renamed(path: string, name: string): void;
  /** Undoable change made by the person. Returns whether it was made. */
  commit(fn: (p: Project) => Project): boolean;
  /**
   * Undoable change made by an AI tool call, recorded under `entry`. Refused (false) when
   * `entry.projectId` is not the open project.
   */
  commitAs(entry: AiEntry, fn: (p: Project) => Project): boolean;
  /**
   * Change that should not enter the undo history (e.g. a thumbnail finishing). Undo and redo
   * keep the media fields listed in ASSET_RUNTIME_FIELDS (shared/history.ts) as they are now.
   */
  patch(fn: (p: Project) => Project): void;
  patchAsset(id: string, changes: Partial<Asset>): void;
  /** The media file (or its cursor data) was found elsewhere: the new place replaces the old
   *  one in the whole history. */
  relinkAsset(id: string, changes: RelinkChanges): void;
  /** Ctrl+Z: one step, or the whole AI turn on top. */
  undo(): void;
  redo(): void;
  /** The AI's undo tool: only its own steps on top (`mine`), up to `steps`. Returns how many. */
  undoAi(mine: (entry: HistoryEntry) => boolean, steps: number): number;
  /** Changes the pending AI proposals: kept in the project, outside the undo history. */
  setProposals(fn: (list: StoredProposal[]) => StoredProposal[]): void;
  /** The guided plans as the recorder saved them: kept in the project, outside the undo history. */
  setGuided(store: GuidedStore): void;
  select(ids: string[]): void;
  /** Saves the current state; resolves false when it could not be written. */
  saveNow(): Promise<boolean>;
  /** Writes what is pending: cancels the autosave timer and waits for a save in flight. */
  flush(): Promise<boolean>;
  /** Saves the project at a path the user picks and goes on editing that copy. */
  saveCopyAs(): Promise<boolean>;
  /** Commits by the person until endGroup() make one undo step (pasting properties). */
  beginGroup(): void;
  endGroup(): void;
  /** Starts a turn of the chat inside EdiAula for the open project (null if it is another). */
  beginAiTurn(projectId: string): AiTurn | null;
  /** Ends `turn`; ending it twice or after another began does nothing. */
  endAiTurn(turn: AiTurn | null): void;
  /**
   * Writes a change into the draft of `author` instead of the project: `fn` gets the project as
   * the draft shows it. A draft of another author waiting for review refuses it (false).
   */
  writeDraft(author: string, title: string, fn: (p: Project) => Project): boolean;
  /** The person accepted or rejected items of the draft. */
  setDraftItems(items: DiffItem[]): void;
  discardDraft(): void;
  /**
   * Writes the accepted items into the project as one undo step. Refused, with nothing changed,
   * when the lesson changed under some of them since the draft was made.
   */
  applyDraft(): { ok: boolean; applied: number; conflicts: string[] };
}

let timer: ReturnType<typeof setTimeout> | undefined;
/** The state last written to `path`. */
let lastSaved: Project | null = null;
/** Saves run one after another, so the latest state is always the last one written. */
let inFlight: Promise<boolean> | null = null;
/** Work on the lesson's file (a rename) that saves wait for, so none lands on the old file. */
let held: Promise<unknown> | null = null;

/**
 * Runs `work` on the open lesson's file with saves waiting: an edit made meanwhile is saved
 * once it is done, at the path the lesson has then. `work` itself never waits for a save (that
 * save would wait for it): flush before, as renameLesson does.
 */
export async function holdingSaves<T>(work: () => Promise<T>): Promise<T> {
  const running = work();
  const settled = running.then(
    () => undefined,
    () => undefined,
  );
  held = settled;
  try {
    return await running;
  } finally {
    if (held === settled) held = null;
  }
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** One counter for every project opened in this session: a revision never repeats. */
let revisionCounter = 0;
const nextRevision = (): number => ++revisionCounter;

/** The person's manual group (beginGroup/endGroup) in progress. */
let manualGroup: { key: string; depth: number } | null = null;

/** History entry of an AI tool call, with the project it may change. */
export type AiEntry = HistoryEntry & { origin: "ai"; projectId?: string };

/** A way to commit: the person's (`personCommit`) or an AI call's (handed to tool handlers). */
export type Commit = (fn: (p: Project) => Project) => boolean;

const historyOf = (s: ProjectStore): History => ({
  past: s.past,
  pastMeta: s.pastMeta,
  future: s.future,
  futureMeta: s.futureMeta,
});

const emptyState = {
  past: [],
  future: [],
  pastMeta: [],
  futureMeta: [],
  selection: [],
  saveState: "saved" as SaveState,
  saveError: undefined,
  aiTurn: null,
  draft: null,
};

export const useProject = create<ProjectStore>((set, get) => {
  /** Applies a change and records its undo step under `entry`. */
  const record = (entry: HistoryEntry, fn: (p: Project) => Project): boolean => {
    const state = get();
    const { project } = state;
    if (!project) return false;
    const next = { ...fn(project), updatedAt: Date.now() };
    const ids = new Set(next.clips.map((c) => c.id));
    set({
      project: next,
      ...pushCommit(historyOf(state), project, entry, HISTORY_LIMIT),
      selection: state.selection.filter((id) => ids.has(id)),
      revision: nextRevision(),
    });
    return true;
  };
  return {
    project: null,
    path: null,
    ...emptyState,
    revision: 0,

    load: (path, project) => {
      clearTimeout(timer);
      // What is loaded is what the file holds (opened, created or a backup put back in place),
      // even when the path stays the same: nothing to save until the first edit.
      lastSaved = project;
      // Another project: no proposal, view or AI turn of the previous one carries over.
      set({ path, project, ...emptyState, revision: nextRevision() });
      useApp.getState().set({ interval: null, solo: [] });
    },
    close: () => {
      clearTimeout(timer);
      set({ project: null, path: null, ...emptyState, revision: nextRevision() });
      useApp.getState().set({ interval: null, solo: [] });
    },

    renamed: (path, name) => {
      // The file was renamed on disk with the new name in it: the lesson goes on there, and
      // stepping through the history keeps the new name.
      const rename = (p: Project): Project => ({ ...p, name });
      const { project, past, future } = get();
      if (!project) return;
      const next = rename(project);
      // What the file holds is what was saved, now under the new name: an edit made while the
      // file was renamed is still to be saved, at the new path.
      const saved = lastSaved === project ? next : lastSaved && rename(lastSaved);
      set({ path, project: next, past: past.map(rename), future: future.map(rename) });
      lastSaved = saved;
      if (next !== saved) {
        set({ saveState: "pending" });
        clearTimeout(timer);
        timer = setTimeout(() => void get().saveNow(), AUTOSAVE_DELAY);
      }
    },

    commit: (fn) =>
      record(manualGroup ? { origin: "user", key: manualGroup.key } : { origin: "user" }, fn),
    commitAs: (entry, fn) => {
      // An AI call never writes into a project other than the one it was made for.
      if (entry.projectId && get().project?.id !== entry.projectId) return false;
      const { projectId: _project, ...history } = entry;
      return record(history, fn);
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
      const relink = (p: Project): Project => relinkIn(p, old, changes);
      set({ project: relink(project), past: past.map(relink), future: future.map(relink) });
    },

    undo: () => {
      const state = get();
      if (!state.project) return;
      const done = undoSteps(
        historyOf(state),
        state.project,
        undoSpan(historyOf(state)),
        Date.now(),
      );
      if (done) set({ project: done.project, ...done.history, revision: nextRevision() });
    },
    redo: () => {
      const state = get();
      if (!state.project) return;
      const done = redoSteps(
        historyOf(state),
        state.project,
        redoSpan(historyOf(state)),
        Date.now(),
      );
      if (done) set({ project: done.project, ...done.history, revision: nextRevision() });
    },
    undoAi: (mine, steps) => {
      const state = get();
      if (!state.project) return 0;
      const n = aiUndoCount(historyOf(state), mine, steps);
      const done = undoSteps(historyOf(state), state.project, n, Date.now());
      if (!done) return 0;
      set({ project: done.project, ...done.history, revision: nextRevision() });
      return n;
    },

    setProposals: (fn) => {
      const { project } = get();
      if (!project) return;
      const list = fn(project.proposals ?? []);
      const next: Project = { ...project };
      if (list.length) next.proposals = list;
      else delete next.proposals;
      set({ project: next });
    },

    setGuided: (store) => {
      const { project } = get();
      if (!project) return;
      set({ project: { ...project, guided: store } });
    },

    beginGroup: () => {
      manualGroup = manualGroup
        ? { ...manualGroup, depth: manualGroup.depth + 1 }
        : { key: `group:${newId("g")}`, depth: 1 };
    },
    endGroup: () => {
      if (!manualGroup) return;
      manualGroup = manualGroup.depth > 1 ? { ...manualGroup, depth: manualGroup.depth - 1 } : null;
    },

    beginAiTurn: (projectId) => {
      if (get().project?.id !== projectId) return null;
      const turn: AiTurn = { id: newId("turn"), projectId };
      set({ aiTurn: turn });
      return turn;
    },
    endAiTurn: (turn) => {
      const open = get().aiTurn;
      const next = closeTurn(open, turn);
      if (next !== open) set({ aiTurn: next });
    },

    writeDraft: (author, title, fn) => {
      const { project, draft } = get();
      if (!project) return false;
      const own = draft && draft.projectId === project.id ? draft : null;
      if (own && own.author !== author) return false;
      const next = draftWrite(own, project, fn);
      if (!next) return true;
      set({
        draft: own
          ? { ...own, title, ...next }
          : { id: newId("draft"), projectId: project.id, author, title, ...next },
      });
      return true;
    },
    setDraftItems: (items) => {
      const { draft } = get();
      if (draft) set({ draft: { ...draft, items } });
    },
    discardDraft: () => set({ draft: null }),
    applyDraft: () => {
      const { project, draft } = get();
      if (!project || !draft || draft.projectId !== project.id)
        return { ok: false, applied: 0, conflicts: [] };
      const pending = draft.items.filter((i) => i.status === "pending");
      const { conflicts } = applyItems(project, pending);
      if (conflicts.length) return { ok: false, applied: 0, conflicts };
      const ok = !pending.length || get().commit((p) => applyItems(p, pending).project);
      if (ok) set({ draft: null });
      return { ok, applied: ok ? pending.length : 0, conflicts: [] };
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
          await window.api.saveProject(path, JSON.stringify(project));
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
      // `run` never rejects, so the chain always moves on to the next save; it waits for work
      // on the file (holdingSaves) and then writes where the lesson is by then.
      const next = (inFlight ?? Promise.resolve(true)).then(() => held).then(run);
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
      const { toast } = useApp.getState();
      let target: string | null;
      try {
        target = await window.api.pickProjectCopyPath(`${project.name} (cópia)`);
      } catch (err) {
        toast(`Não foi possível escolher onde salvar a cópia: ${message(err)}`, "error");
        return false;
      }
      if (!target) return false;
      // The copy is a lesson of its own: named after its file and with its own id, so the recent
      // list and the export marks tell it apart from the original.
      const file = fileName(target);
      const identity = {
        id: newId("p"),
        name: file.toLowerCase().endsWith(".ediaula") ? file.slice(0, -".ediaula".length) : file,
      };
      const copy: Project = {
        ...project,
        ...identity,
        ...(project.proposals
          ? {
              proposals: project.proposals.map((proposal) => ({
                ...proposal,
                projectId: identity.id,
              })),
            }
          : {}),
      };
      try {
        await window.api.saveProject(target, JSON.stringify(copy));
      } catch (err) {
        set({ saveState: "error", saveError: message(err) });
        return false;
      }
      // The original location is the one failing: autosave goes on in the copy.
      clearTimeout(timer);
      // Pending proposals belong to the lesson, which now goes on under the copy's id.
      const rename = (p: Project): Project => ({
        ...p,
        ...identity,
        ...(p.proposals
          ? { proposals: p.proposals.map((proposal) => ({ ...proposal, projectId: identity.id })) }
          : {}),
      });
      const { project: now, past, future, draft } = get();
      const current = now === project;
      set({
        path: target,
        project: current ? copy : now && rename(now),
        past: past.map(rename),
        future: future.map(rename),
        // A draft waiting for review goes on in the copy too.
        draft:
          draft && draft.projectId === project.id
            ? { ...draft, projectId: identity.id, base: rename(draft.base) }
            : draft,
        saveState: current ? "saved" : "pending",
        saveError: undefined,
      });
      lastSaved = current ? copy : null;
      if (!current) void get().saveNow();
      toast(`Cópia salva em ${target}. A edição continua nela.`, "success");
      return true;
    },
  };
});

/** The person's commit, for helpers that also serve AI tools (which pass their own). */
export const personCommit: Commit = (fn) => useProject.getState().commit(fn);

/**
 * Edits still on their way into the project (an annotation being redrawn) and text typed in a
 * field but not committed yet. Leaving the project (settleEdits) commits the drafts and waits
 * for both before the last save, so neither is lost by closing the window or going home.
 */
const pendingEdits = new Set<Promise<unknown>>();
const drafts = new Map<symbol, () => void>();

export function trackEdit<T>(work: Promise<T>): Promise<T> {
  pendingEdits.add(work);
  const done = (): void => {
    pendingEdits.delete(work);
  };
  work.then(done, done);
  return work;
}

/** A field with uncommitted text: `commit` writes it. Returns the function that forgets it. */
export function registerDraft(commit: () => void): () => void {
  const key = Symbol("draft");
  drafts.set(key, commit);
  return () => {
    drafts.delete(key);
  };
}

export async function settleEdits(): Promise<void> {
  for (const commit of [...drafts.values()]) commit();
  while (pendingEdits.size) await Promise.allSettled([...pendingEdits]);
}

/** True while some change is not on disk yet (or is being written, typed or redrawn). */
export const hasUnsavedWork = (): boolean => {
  const { project, draft } = useProject.getState();
  return (
    drafts.size > 0 ||
    pendingEdits.size > 0 ||
    // A draft waiting for review lives only in memory.
    (!!project && !!draft && draft.projectId === project.id) ||
    (!!project && (project !== lastSaved || inFlight !== null))
  );
};

/**
 * Whether a draft waiting for review changes the structure of the lesson (clips split, trimmed,
 * moved or removed): until it is applied or discarded, what is on screen is not where the clips
 * of the lesson are, so editing the clips by hand and reviewing cuts wait for it.
 */
export function structuralDraft(
  s: Pick<ProjectStore, "project" | "draft"> = useProject.getState(),
): boolean {
  return (
    !!s.project &&
    !!s.draft &&
    s.draft.projectId === s.project.id &&
    s.draft.items.some((i) => i.kind === "structure" && i.status === "pending")
  );
}

/** Tells the person why an action waits for the draft; true when it has to wait. */
export function waitForDraft(action: string): boolean {
  if (!structuralDraft()) return false;
  useApp
    .getState()
    .toast(
      `Há um rascunho que muda a estrutura da aula esperando revisão: aplique ou descarte antes de ${action}.`,
      "info",
    );
  return true;
}

// Autosave shortly after every change. A failure stays on screen until a save succeeds.
useProject.subscribe((s, prev) => {
  if (s.path !== prev.path) lastSaved = s.project;
  if (!s.project || !s.path || s.project === prev.project || s.project === lastSaved) return;
  if (s.saveState !== "pending" && s.saveState !== "error")
    useProject.setState({ saveState: "pending" });
  clearTimeout(timer);
  timer = setTimeout(() => void useProject.getState().saveNow(), AUTOSAVE_DELAY);
});

/**
 * Runs an AI tool call with its own commit: everything it changes through that function is
 * recorded under `entry` and only in `entry.projectId`. What the person does meanwhile goes
 * through the plain commit and is always theirs. Returns the result and whether a commit was
 * refused because another project was open by then.
 */
export async function runAsAi<T>(
  entry: AiEntry,
  fn: (commit: Commit) => Promise<T>,
): Promise<{ value: T; refused: boolean }> {
  let refused = false;
  const commit: Commit = (change) => {
    const done = useProject.getState().commitAs(entry, change);
    if (!done) refused = true;
    return done;
  };
  const value = await fn(commit);
  return { value, refused };
}

export const assetMap = (p: Project | null): Map<string, Asset> =>
  new Map((p?.assets ?? []).map((a) => [a.id, a]));

let shown: {
  project: Project | null;
  draft: Draft | null;
  view: { project: Project | null; conflicts: string[] };
} | null = null;

/**
 * The project as the person sees it: with the draft's accepted items on top, and the items that
 * no longer fit (the lesson changed there since). The same objects while nothing changes.
 */
export function draftView(s: Pick<ProjectStore, "project" | "draft"> = useProject.getState()): {
  project: Project | null;
  conflicts: string[];
} {
  if (shown && shown.project === s.project && shown.draft === s.draft) return shown.view;
  const view =
    s.project && s.draft && s.draft.projectId === s.project.id
      ? applyItems(s.project, s.draft.items)
      : { project: s.project, conflicts: [] };
  shown = { project: s.project, draft: s.draft, view };
  return view;
}

/** The project to show in the preview and on the timeline (draftView). */
export const shownProject = (): Project | null => draftView().project;

export function useShownProject(): Project | null {
  const project = useProject((s) => s.project);
  const draft = useProject((s) => s.draft);
  return useMemo(() => draftView({ project, draft }).project, [project, draft]);
}

/**
 * The commit an AI tool or a step of "Preparar aula" uses when it proposes: everything it
 * changes goes into the draft of `author`, in the project `projectId` only.
 */
export function draftCommit(author: string, title: string, projectId?: string): Commit {
  return onDraftView((fn) => {
    const { project } = useProject.getState();
    if (!project || (projectId && project.id !== projectId)) return false;
    return useProject.getState().writeDraft(author, title, fn);
  });
}

/** Commits that write into a draft: what they add is worked out on the draft as shown. */
const draftCommits = new WeakSet<Commit>();

/** Marks `commit` as writing into the draft (draftCommit, or a commit wrapping one). */
export function onDraftView(commit: Commit): Commit {
  draftCommits.add(commit);
  return commit;
}

/** Whether `commit` writes into the draft (draftCommit, or a commit marked by onDraftView). */
export const writesIntoDraft = (commit: Commit): boolean => draftCommits.has(commit);

/**
 * The project a commit's changes are worked out on: the draft as shown for a commit into the
 * draft (an annotation added after the draft's palette takes its colors), else the lesson.
 */
export const basisOf = (commit: Commit): Project | null =>
  draftCommits.has(commit) ? shownProject() : useProject.getState().project;
