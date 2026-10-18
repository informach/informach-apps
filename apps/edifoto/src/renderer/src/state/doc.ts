import { type Doc, identifyGradientStops, type Layer } from "@shared/doc";
import { referencedBitmaps, validateDocument } from "@shared/documentFormat";
import { create } from "zustand";
import { collectBitmaps, getBitmap, touchBitmap } from "@/engine/bitmaps";
import { compositor } from "@/engine/compositor";
import { assertNotPainting } from "@/lib/paint";
import { useUi } from "./ui";

/** Pixels a step changed in one bitmap, so painting can be undone without full copies. */
export interface Patch {
  bitmap: string;
  x: number;
  y: number;
  before: ImageData;
  after: ImageData;
}

export interface HistoryEntry {
  id: number;
  label: string;
  before: Doc;
  after: Doc;
  activeBefore: string | null;
  activeAfter: string | null;
  patches: Patch[];
  /** Consecutive commits with the same key (slider drags, AI turns) merge into one step. */
  key?: string;
  time: number;
  byAi?: boolean;
  stateBefore: number;
  stateAfter: number;
}

interface CommitOptions {
  /** Merge with the previous step when it has the same key and is recent. */
  key?: string;
  active?: string | null;
  patches?: Patch[];
}

interface DocStore {
  doc: Doc | null;
  activeId: string | null;
  /** Path of the .edifoto file, once saved. */
  filePath: string | null;
  /** Image the document came from (default export name/folder). */
  sourcePath: string | null;
  /** Bumps on every visible change, including painting (document JSON unchanged). */
  revision: number;
  dirty: boolean;
  stateId: number;
  savedStateId: number | null;
  initialStateId: number;
  past: HistoryEntry[];
  future: HistoryEntry[];

  load(
    doc: Doc,
    opts?: {
      filePath?: string | null;
      sourcePath?: string | null;
      activeId?: string | null;
      dirty?: boolean;
    },
  ): void;
  close(): void;
  commit(label: string, recipe: (d: Doc) => Doc, opts?: CommitOptions): void;
  setActive(id: string | null): void;
  bump(): void;
  undo(): void;
  redo(): void;
  jumpTo(entryId: number): void;
  markSaved(path: string, docId?: string, stateId?: number, workspaceId?: number): void;
}

let aiTransaction: {
  before: DocStore;
  key: string;
  label: string;
  patches: Patch[];
  selection: string | null;
} | null = null;
/** Only a synchronous tool mutation owns this scope; dialogs and decoding happen outside it. */
export function executeAiTransaction<T>(key: string, label: string, run: () => T): T {
  assertNotPainting();
  if (aiTransaction) throw new Error("Outra edição está em andamento.");
  const before = useDoc.getState(),
    ui = useUi.getState();
  aiTransaction = { before, key, label, patches: [], selection: ui.selection };
  try {
    return run();
  } catch (error) {
    applyPatches(aiTransaction.patches, "before");
    useDoc.setState(before);
    useUi.setState(ui);
    throw error;
  } finally {
    aiTransaction = null;
    collectDocumentBitmaps();
  }
}

const LIMIT = 80;
let nextEntry = 1;
let nextState = 1;
const HISTORY_BYTES = 128 * 1024 * 1024;

function trimHistory(entries: HistoryEntry[]): HistoryEntry[] {
  let bytes = 0,
    start = entries.length;
  for (let i = entries.length - 1; i >= 0; i--) {
    const size = entries[i].patches.reduce(
      (n, p) => n + p.before.data.byteLength + p.after.data.byteLength,
      0,
    );
    if (i < entries.length - 1 && (bytes + size > HISTORY_BYTES || entries.length - i > LIMIT))
      break;
    bytes += size;
    start = i;
  }
  return entries.slice(start);
}

function applyPatches(patches: Patch[], side: "before" | "after"): void {
  const list = side === "before" ? [...patches].reverse() : patches;
  for (const p of list) {
    const b = getBitmap(p.bitmap);
    if (!b) continue;
    const data = p[side];
    b.ctx.putImageData(data, p.x, p.y);
    touchBitmap(p.bitmap, { x: p.x, y: p.y, w: data.width, h: data.height });
  }
}

export const useDoc = create<DocStore>((set, get) => ({
  doc: null,
  activeId: null,
  filePath: null,
  sourcePath: null,
  revision: 0,
  dirty: false,
  stateId: 0,
  savedStateId: null,
  initialStateId: 0,
  past: [],
  future: [],

  load: (doc, opts = {}) => {
    assertNotPainting();
    doc = identifyGradientStops(validateDocument(doc));
    compositor().rememberOriginal(doc);
    const stateId = nextState++,
      dirty = opts.dirty ?? !(opts.filePath || opts.sourcePath);
    set({
      doc: identifyGradientStops(doc),
      activeId: opts.activeId ?? doc.layers[doc.layers.length - 1]?.id ?? null,
      filePath: opts.filePath ?? null,
      sourcePath: opts.sourcePath ?? null,
      revision: get().revision + 1,
      dirty,
      stateId,
      savedStateId: dirty ? null : stateId,
      initialStateId: stateId,
      past: [],
      future: [],
    });
  },

  close: () => {
    assertNotPainting();
    compositor().clearOriginal();
    set({
      doc: null,
      activeId: null,
      filePath: null,
      sourcePath: null,
      past: [],
      future: [],
      dirty: false,
      stateId: nextState++,
      savedStateId: null,
      revision: get().revision + 1,
    });
  },

  commit: (label, recipe, opts = {}) => {
    assertNotPainting();
    const s = get();
    if (!s.doc) return;
    let after: Doc;
    try {
      after = identifyGradientStops(recipe(s.doc));
      if (after !== s.doc) validateDocument(after);
    } catch (error) {
      collectDocumentBitmaps();
      throw error;
    }
    const activeAfter = opts.active !== undefined ? opts.active : s.activeId;
    const patches = opts.patches ?? [];
    if (after === s.doc && !patches.length && activeAfter === s.activeId) return;
    const key = aiTransaction?.key ?? opts.key;
    if (aiTransaction) aiTransaction.patches.push(...patches);
    const last = s.past[s.past.length - 1];
    const now = Date.now();
    const stateId = nextState++;
    let past: HistoryEntry[];
    if (
      key &&
      last?.key === key &&
      last.stateAfter !== s.savedStateId &&
      (aiTransaction || now - last.time < 1500)
    ) {
      past = [
        ...s.past.slice(0, -1),
        {
          ...last,
          after,
          activeAfter,
          patches: [...last.patches, ...patches],
          time: now,
          stateAfter: stateId,
        },
      ];
    } else {
      const entry: HistoryEntry = {
        id: nextEntry++,
        label: aiTransaction?.label ?? label,
        before: s.doc,
        after,
        activeBefore: s.activeId,
        activeAfter,
        patches,
        key,
        time: now,
        byAi: !!aiTransaction,
        stateBefore: s.stateId,
        stateAfter: stateId,
      };
      past = [...s.past, entry];
    }
    set({
      doc: after,
      activeId: activeAfter,
      past: trimHistory(past),
      future: [],
      dirty: true,
      stateId,
      revision: s.revision + 1,
    });
  },

  setActive: (id) => {
    assertNotPainting();
    set({ activeId: id });
  },

  bump: () => set({ revision: get().revision + 1 }),

  undo: () => {
    assertNotPainting();
    const s = get();
    const e = s.past[s.past.length - 1];
    if (!e) return;
    applyPatches(e.patches, "before");
    set({
      doc: e.before,
      activeId: e.activeBefore,
      past: s.past.slice(0, -1),
      future: [e, ...s.future],
      dirty: e.stateBefore !== s.savedStateId,
      stateId: e.stateBefore,
      revision: s.revision + 1,
    });
  },

  redo: () => {
    assertNotPainting();
    const s = get();
    const e = s.future[0];
    if (!e) return;
    applyPatches(e.patches, "after");
    set({
      doc: e.after,
      activeId: e.activeAfter,
      past: [...s.past, e],
      future: s.future.slice(1),
      dirty: e.stateAfter !== s.savedStateId,
      stateId: e.stateAfter,
      revision: s.revision + 1,
    });
  },

  jumpTo: (entryId) => {
    assertNotPainting();
    const s = get();
    if (s.past.some((e) => e.id === entryId)) {
      while (get().past.length && get().past[get().past.length - 1].id !== entryId) get().undo();
    } else if (s.future.some((e) => e.id === entryId)) {
      while (get().future.length && get().past[get().past.length - 1]?.id !== entryId) get().redo();
    }
  },

  markSaved: (path, docId, stateId, workspaceId) => {
    const s = get();
    if (
      !s.doc ||
      (docId !== undefined && s.doc.id !== docId) ||
      (workspaceId !== undefined && s.initialStateId !== workspaceId)
    )
      return;
    const savedStateId = stateId ?? s.stateId;
    set({ filePath: path, savedStateId, dirty: s.stateId !== savedStateId });
  },
}));

export function collectDocumentBitmaps(): void {
  const s = useDoc.getState(),
    live = new Set<string>();
  const add = (doc: Doc) => {
    for (const id of referencedBitmaps(doc)) live.add(id);
  };
  if (aiTransaction) {
    if (aiTransaction.selection) live.add(aiTransaction.selection);
    if (aiTransaction.before.doc) add(aiTransaction.before.doc);
    for (const entry of [...aiTransaction.before.past, ...aiTransaction.before.future]) {
      add(entry.before);
      add(entry.after);
      for (const patch of entry.patches) live.add(patch.bitmap);
    }
  }
  if (s.doc) add(s.doc);
  for (const e of [...s.past, ...s.future]) {
    add(e.before);
    add(e.after);
    for (const p of e.patches) live.add(p.bitmap);
  }
  const selection = useUi.getState().selection;
  if (selection) live.add(selection);
  collectBitmaps(live);
}
useDoc.subscribe(collectDocumentBitmaps);
useUi.subscribe((current, previous) => {
  if (current.selection !== previous.selection) collectDocumentBitmaps();
});

/* ----- Helpers for recipes ----- */

export const findLayer = (doc: Doc, id: string | null | undefined): Layer | undefined =>
  id ? doc.layers.find((l) => l.id === id) : undefined;

export function updateLayer<T extends Layer>(doc: Doc, id: string, fn: (l: T) => T): Doc {
  return { ...doc, layers: doc.layers.map((l) => (l.id === id ? fn(l as T) : l)) };
}

export const activeLayer = (): Layer | undefined => {
  const s = useDoc.getState();
  return s.doc ? findLayer(s.doc, s.activeId) : undefined;
};
