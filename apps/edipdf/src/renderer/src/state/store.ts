import type { Annot, Box, DocContent, FontKey, ShapeAnnot, TextAnnot } from "@shared/model";
import type { RecentFile, SavedSignature } from "@shared/types";
import { create } from "zustand";

export type Tool =
  | "select"
  | "hand"
  | "text"
  | "edittext"
  | "highlight"
  | "underline"
  | "strike"
  | "ink"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "note"
  | "whiteout";

export interface ToolStyle {
  text: { font: FontKey; size: number; color: string; bold: boolean; italic: boolean };
  ink: { stroke: string; width: number; opacity: number };
  shape: { stroke: string | null; fill: string | null; width: number; opacity: number };
  line: { stroke: string; width: number; opacity: number };
  markup: { highlight: string; underline: string; strike: string };
  note: { color: string };
}

export interface SearchState {
  query: string;
  /** One entry per match: page id plus the rectangles to paint. */
  results: { page: string; rects: Box[] }[];
  index: number;
  running: boolean;
}

/** Text being typed. It only enters the document (and undo history) when editing ends. */
export interface TextDraft {
  annot: TextAnnot;
  /** "Editar texto": the box that hides the original text. */
  cover?: ShapeAnnot;
  /** The annotation as it was before editing, to skip no-op edits. */
  before?: TextAnnot;
  /** Editing an annotation that already exists in the document. */
  existing?: boolean;
}

export interface DocState {
  id: string;
  name: string;
  path: string | null;
  /** Source used as the base file when saving (keeps metadata, forms and outline). */
  primary: string | null;
  sourceIds: string[];
  content: DocContent;
  saved: DocContent;
  past: DocContent[];
  future: DocContent[];
  /** Selected page ids (thumbnails / organize view). */
  selection: string[];
  selectedAnnot: string | null;
  /** Note whose popup is open. */
  openNote: string | null;
  draft: TextDraft | null;
  zoom: number;
  fit: "width" | "page" | null;
  currentPage: number;
  view: "pages" | "organize";
  search: SearchState | null;
  /** Bumped to ask the viewer to scroll a page into view. */
  scrollRequest: { page: number; y?: number; nonce: number } | null;
  hasForms: boolean;
}

export type DialogSpec =
  | { kind: "combine" }
  | { kind: "compress"; mode: "doc" | "files" }
  | { kind: "signature" }
  | { kind: "watermark" }
  | { kind: "pageNumbers" }
  | { kind: "properties" }
  | { kind: "insertBlank" }
  | { kind: "split" }
  | { kind: "exportImages" }
  | { kind: "password"; name: string; retry: boolean; resolve: (pw: string | null) => void };

export interface Toast {
  id: number;
  text: string;
  tone?: "ok" | "error";
  action?: { label: string; run: () => void };
}

interface AppState {
  docs: DocState[];
  activeId: string | null;
  tool: Tool;
  style: ToolStyle;
  recents: RecentFile[];
  signatures: SavedSignature[];
  dialog: DialogSpec | null;
  toasts: Toast[];
  busy: string | null;
  sidebar: boolean;
  panel: boolean;
}

export const MAX_HISTORY = 100;

export const useApp = create<AppState>(() => ({
  docs: [],
  activeId: null,
  tool: "select",
  style: {
    text: { font: "helvetica", size: 14, color: "#111111", bold: false, italic: false },
    ink: { stroke: "#1D4ED8", width: 2, opacity: 1 },
    shape: { stroke: "#DC2626", fill: null, width: 2, opacity: 1 },
    line: { stroke: "#DC2626", width: 2, opacity: 1 },
    markup: { highlight: "#FFE45C", underline: "#16A34A", strike: "#DC2626" },
    note: { color: "#F59E0B" },
  },
  recents: [],
  signatures: [],
  dialog: null,
  toasts: [],
  busy: null,
  sidebar: true,
  panel: true,
}));

export const activeDoc = (s: AppState = useApp.getState()): DocState | undefined =>
  s.docs.find((d) => d.id === s.activeId);
export const useActiveDoc = (): DocState | undefined =>
  useApp((s) => s.docs.find((d) => d.id === s.activeId));
export const isDirty = (d: DocState): boolean => d.content !== d.saved;

/** Patches view state of a document (not recorded in undo history). */
export function patchDoc(
  id: string,
  patch: Partial<DocState> | ((d: DocState) => Partial<DocState>),
): void {
  useApp.setState((s) => ({
    docs: s.docs.map((d) => {
      if (d.id !== id) return d;
      const next = { ...d, ...(typeof patch === "function" ? patch(d) : patch) };
      if (next.content.pages !== d.content.pages) {
        const ids = new Set(next.content.pages.map((p) => p.id));
        next.currentPage = Math.max(0, Math.min(next.currentPage, next.content.pages.length - 1));
        next.selection = next.selection.filter((page) => ids.has(page));
        next.search = null;
      }
      return next;
    }),
  }));
}

/** Applies an undoable change to a document's content. */
export function commit(
  id: string,
  change: (c: DocContent) => DocContent,
  extra?: Partial<DocState>,
): void {
  patchDoc(id, (d) => {
    const next = change(d.content);
    if (next === d.content) return extra ?? {};
    return {
      content: next,
      past: [...d.past.slice(-MAX_HISTORY + 1), d.content],
      future: [],
      ...extra,
    };
  });
}

export function undo(id: string): void {
  patchDoc(id, (d) => {
    if (!d.past.length) return {};
    const prev = d.past[d.past.length - 1];
    return {
      content: prev,
      past: d.past.slice(0, -1),
      future: [d.content, ...d.future],
      selectedAnnot: null,
      openNote: null,
    };
  });
}

export function redo(id: string): void {
  patchDoc(id, (d) => {
    if (!d.future.length) return {};
    const [next, ...rest] = d.future;
    return {
      content: next,
      past: [...d.past, d.content],
      future: rest,
      selectedAnnot: null,
      openNote: null,
    };
  });
}

export const updateAnnot = (docId: string, annotId: string, patch: Partial<Annot>): void => {
  commit(docId, (c) => ({
    ...c,
    annots: c.annots.map((a) => (a.id === annotId ? ({ ...a, ...patch } as Annot) : a)),
  }));
};

export const addAnnot = (docId: string, a: Annot, select = true): void => {
  commit(
    docId,
    (c) => ({ ...c, annots: [...c.annots, a] }),
    select ? { selectedAnnot: a.id } : undefined,
  );
};

export const removeAnnot = (docId: string, annotId: string): void => {
  commit(docId, (c) => ({ ...c, annots: c.annots.filter((a) => a.id !== annotId) }), {
    selectedAnnot: null,
    openNote: null,
  });
};

let toastId = 0;
export function toast(
  text: string,
  opts: { tone?: Toast["tone"]; action?: Toast["action"]; ms?: number } = {},
): void {
  const t: Toast = { id: ++toastId, text, tone: opts.tone, action: opts.action };
  useApp.setState((s) => ({ toasts: [...s.toasts, t] }));
  setTimeout(
    () => useApp.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })),
    opts.ms ?? (opts.action ? 7000 : 3500),
  );
}

export const setTool = (tool: Tool): void => {
  useApp.setState({ tool });
  const d = activeDoc();
  if (d && (d.selectedAnnot || d.openNote)) patchDoc(d.id, { selectedAnnot: null, openNote: null });
};
