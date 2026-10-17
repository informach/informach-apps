import { type Doc, identifyGradientStops, type Layer } from "@shared/doc";
import { create } from "zustand";
import { getBitmap, touchBitmap } from "@/engine/bitmaps";

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
  past: HistoryEntry[];
  future: HistoryEntry[];
  group: { label: string; key: string } | null;

  load(
    doc: Doc,
    opts?: { filePath?: string | null; sourcePath?: string | null; activeId?: string | null },
  ): void;
  close(): void;
  commit(label: string, recipe: (d: Doc) => Doc, opts?: CommitOptions): void;
  setActive(id: string | null): void;
  bump(): void;
  undo(): void;
  redo(): void;
  jumpTo(entryId: number): void;
  beginGroup(label: string): void;
  endGroup(): void;
  markSaved(path: string): void;
}

const LIMIT = 80;
let nextEntry = 1;
let groupSeq = 1;

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
  past: [],
  future: [],
  group: null,

  load: (doc, opts = {}) =>
    set({
      doc: identifyGradientStops(doc),
      activeId: opts.activeId ?? doc.layers[doc.layers.length - 1]?.id ?? null,
      filePath: opts.filePath ?? null,
      sourcePath: opts.sourcePath ?? null,
      revision: get().revision + 1,
      dirty: false,
      past: [],
      future: [],
      group: null,
    }),

  close: () =>
    set({
      doc: null,
      activeId: null,
      filePath: null,
      sourcePath: null,
      past: [],
      future: [],
      dirty: false,
      revision: get().revision + 1,
    }),

  commit: (label, recipe, opts = {}) => {
    const s = get();
    if (!s.doc) return;
    const after = identifyGradientStops(recipe(s.doc));
    const activeAfter = opts.active !== undefined ? opts.active : s.activeId;
    const patches = opts.patches ?? [];
    if (after === s.doc && !patches.length && activeAfter === s.activeId) return;
    const key = s.group?.key ?? opts.key;
    const last = s.past[s.past.length - 1];
    const now = Date.now();
    let past: HistoryEntry[];
    if (key && last?.key === key && (s.group || now - last.time < 1500)) {
      past = [
        ...s.past.slice(0, -1),
        { ...last, after, activeAfter, patches: [...last.patches, ...patches], time: now },
      ];
    } else {
      const entry: HistoryEntry = {
        id: nextEntry++,
        label: s.group?.label ?? label,
        before: s.doc,
        after,
        activeBefore: s.activeId,
        activeAfter,
        patches,
        key,
        time: now,
        byAi: !!s.group,
      };
      past = [...s.past, entry].slice(-LIMIT);
    }
    set({
      doc: after,
      activeId: activeAfter,
      past,
      future: [],
      dirty: true,
      revision: s.revision + 1,
    });
  },

  setActive: (id) => set({ activeId: id }),

  bump: () => set({ revision: get().revision + 1 }),

  undo: () => {
    const s = get();
    const e = s.past[s.past.length - 1];
    if (!e) return;
    applyPatches(e.patches, "before");
    set({
      doc: e.before,
      activeId: e.activeBefore,
      past: s.past.slice(0, -1),
      future: [e, ...s.future],
      dirty: true,
      revision: s.revision + 1,
    });
  },

  redo: () => {
    const s = get();
    const e = s.future[0];
    if (!e) return;
    applyPatches(e.patches, "after");
    set({
      doc: e.after,
      activeId: e.activeAfter,
      past: [...s.past, e],
      future: s.future.slice(1),
      dirty: true,
      revision: s.revision + 1,
    });
  },

  jumpTo: (entryId) => {
    const s = get();
    if (s.past.some((e) => e.id === entryId)) {
      while (get().past.length && get().past[get().past.length - 1].id !== entryId) get().undo();
    } else if (s.future.some((e) => e.id === entryId)) {
      while (get().future.length && get().past[get().past.length - 1]?.id !== entryId) get().redo();
    }
  },

  /** Everything committed until endGroup becomes one undo step (one assistant turn). */
  beginGroup: (label) => set({ group: { label, key: `group-${groupSeq++}` } }),
  endGroup: () => set({ group: null }),

  markSaved: (path) => set({ filePath: path, dirty: false }),
}));

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
