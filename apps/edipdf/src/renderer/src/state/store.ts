import type { SearchOptions } from "@informach/edi-ocr/search";
import type { Annot, Box, DocContent, FontKey, ShapeAnnot, TextAnnot } from "@shared/model";
import type { PageLayout } from "@shared/page-layout";
import type { RecentFile, SavedSignature } from "@shared/types";
import { create } from "zustand";
import { validateDocumentRevision } from "../../../shared/document-commands.ts";
import type { RecoveryEntry } from "../../../shared/document-format.ts";
import { annotationSchema } from "../../../shared/document-format.ts";
import { sameText } from "../../../shared/model.ts";

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
  results: { id: string; page: string; rects: Box[]; excerpt?: string; note?: string }[];
  index: number;
  running: boolean;
  options?: SearchOptions;
  errors?: { page: number; message: string }[];
  progress?: { page: number; total: number };
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
  historyGroup?: string | null;
  readOnly?: boolean;
  readOnlyReason?: string;
  canCopy?: boolean;
  id: string;
  name: string;
  path: string | null;
  originalPath?: string | null;
  originPaths?: string[];
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
  selectedAnnots?: string[];
  /** Note whose popup is open. */
  openNote: string | null;
  draft: TextDraft | null;
  zoom: number;
  fit: "width" | "page" | null;
  currentPage: number;
  view: "pages" | "organize";
  reading?: boolean;
  pageLayout?: PageLayout;
  navigationRevision?: number;
  search: SearchState | null;
  /** Bumped to ask the viewer to scroll a page into view. */
  scrollRequest: { page: number; y?: number; offset?: number; left?: number; nonce: number } | null;
  hasForms: boolean;
}

export type DialogSpec =
  | { kind: "paragraph"; annotId?: string; initialText?: string }
  | { kind: "batch"; taskId: string }
  | { kind: "scanning"; taskId?: string }
  | { kind: "printing"; taskId?: string }
  | { kind: "compressionResume"; taskId: string; processing: boolean }
  | { kind: "tasks" }
  | { kind: "conversion"; mode: "resume"; taskId: string }
  | { kind: "conversion"; mode: "import" | "export" }
  | { kind: "ocr"; taskId?: string }
  | { kind: "commands" }
  | { kind: "preferences" }
  | { kind: "versions" }
  | { kind: "navigation" }
  | { kind: "forms" }
  | { kind: "annotations" }
  | { kind: "redactSearch" }
  | {
      kind: "localTools";
      mode: "content" | "redact" | "geometry" | "security" | "sanitize";
      occurrence?: number;
      page?: number;
      text?: string;
    }
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
  recoveries: RecoveryEntry[];
  dialog: DialogSpec | null;
  passwordPrompt: Extract<DialogSpec, { kind: "password" }> | null;
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
  recoveries: [],
  dialog: null,
  passwordPrompt: null,
  toasts: [],
  busy: null,
  sidebar: true,
  panel: true,
}));

export const activeDoc = (s: AppState = useApp.getState()): DocState | undefined =>
  s.docs.find((d) => d.id === s.activeId);
export const useActiveDoc = (): DocState | undefined =>
  useApp((s) => s.docs.find((d) => d.id === s.activeId));
export const isDirty = (d: DocState): boolean => {
  if (d.content !== d.saved) return true;
  const draft = d.draft;
  if (!draft) return false;
  if (draft.before) return !sameText(draft.annot, draft.before);
  return draft.annot.text.trim().length > 0;
};

/** Patches view state of a document (not recorded in undo history). */
export function patchDoc(
  id: string,
  patch: Partial<DocState> | ((d: DocState) => Partial<DocState>),
): void {
  useApp.setState((s) => ({
    docs: s.docs.map((d) => {
      if (d.id !== id) return d;
      const changes = typeof patch === "function" ? patch(d) : patch;
      const next = { ...d, ...changes };
      if ("selectedAnnot" in changes && !("selectedAnnots" in changes))
        next.selectedAnnots = changes.selectedAnnot ? [changes.selectedAnnot] : [];
      if (next.content !== d.content) {
        const ids = new Set(next.content.annots.map((annot) => annot.id));
        next.selectedAnnots = next.selectedAnnots?.filter((id) => ids.has(id));
        if (next.selectedAnnot && !ids.has(next.selectedAnnot))
          next.selectedAnnot = next.selectedAnnots?.[0] ?? null;
      }
      const pagesChanged =
        next.content.pages.length !== d.content.pages.length ||
        next.content.pages.some((page, index) => {
          const old = d.content.pages[index];
          return (
            !old ||
            page.id !== old.id ||
            page.src !== old.src ||
            page.index !== old.index ||
            page.rotation !== old.rotation ||
            page.blank?.w !== old.blank?.w ||
            page.blank?.h !== old.blank?.h
          );
        });
      if (pagesChanged) {
        const ids = new Set(next.content.pages.map((p) => p.id));
        next.currentPage = Math.max(0, Math.min(next.currentPage, next.content.pages.length - 1));
        next.selection = next.selection.filter((page) => ids.has(page));
      }
      if (next.content !== d.content && next.search)
        next.search = {
          ...next.search,
          results: [],
          errors: [],
          running: !!next.search.query.trim(),
        };
      if (next.saved !== d.saved) next.historyGroup = null;
      return next;
    }),
  }));
}

/** Applies an undoable change to a document's content. */
export function commit(
  id: string,
  change: (c: DocContent) => DocContent,
  extra?: Partial<DocState>,
): boolean {
  const current = useApp.getState().docs.find((d) => d.id === id);
  if (current?.readOnly) {
    toast(current.readOnlyReason ?? "Documento disponível somente para leitura.", {
      tone: "error",
    });
    return false;
  }
  if (!current) return false;
  let next: DocContent;
  try {
    const changed = change(current.content);
    if (changed === current.content) {
      if (extra) patchDoc(id, extra);
      return true;
    }
    next = validateDocumentRevision(
      changed,
      current.content,
      extra?.sourceIds ?? current.sourceIds,
    );
  } catch (error) {
    toast(
      `Alteração não aplicada: ${error instanceof Error ? error.message : "revisão inválida"}`,
      { tone: "error", ms: 7000 },
    );
    return false;
  }
  patchDoc(id, (d) => ({
    content: next,
    past:
      extra?.historyGroup && extra.historyGroup === d.historyGroup
        ? d.past
        : [...d.past.slice(-MAX_HISTORY + 1), d.content],
    future: [],
    historyGroup: extra?.historyGroup ?? null,
    ...extra,
  }));
  return true;
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
      historyGroup: null,
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
      historyGroup: null,
    };
  });
}

export const updateAnnot = (
  docId: string,
  annotId: string,
  patch: Partial<Annot>,
  historyGroup?: string,
): void => {
  const original = useApp
    .getState()
    .docs.find((doc) => doc.id === docId)
    ?.content.annots.find((annot) => annot.id === annotId);
  if (original?.locked && !(Object.keys(patch).length === 1 && patch.locked === false)) {
    toast("Desbloqueie a anotação antes de editar.", { tone: "error" });
    return;
  }
  commit(
    docId,
    (c) => ({
      ...c,
      annots: c.annots.map((a) =>
        a.id === annotId ? annotationSchema.parse({ ...a, ...patch }) : a,
      ),
    }),
    historyGroup ? { historyGroup } : undefined,
  );
};

export const addAnnot = (docId: string, a: Annot, select = true): void => {
  commit(
    docId,
    (c) => ({ ...c, annots: [...c.annots, a] }),
    select ? { selectedAnnot: a.id } : undefined,
  );
};

export const removeAnnot = (docId: string, annotId: string): void => {
  if (
    useApp
      .getState()
      .docs.find((doc) => doc.id === docId)
      ?.content.annots.find((annot) => annot.id === annotId)?.locked
  ) {
    toast("Desbloqueie a anotação antes de excluir.", { tone: "error" });
    return;
  }
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
  if (d)
    patchDoc(d.id, {
      selectedAnnot: null,
      openNote: null,
      reading: d.reading && !d.readOnly && tool !== "select" && tool !== "hand" ? false : d.reading,
    });
};
