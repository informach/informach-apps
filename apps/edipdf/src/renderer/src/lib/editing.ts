import {
  type Annot,
  type Box,
  mergeLineRects,
  type PageRef,
  sameText,
  type TextAnnot,
  uid,
} from "@shared/model";
import { commit, type DocState, patchDoc, useApp } from "../state/store";
import type { TextItem } from "./pdf";

const docById = (id: string): DocState | undefined =>
  useApp.getState().docs.find((d) => d.id === id);

/** Ends text editing, turning the draft into one undoable change (or none). */
export function finishDraft(docId: string): boolean {
  const doc = docById(docId);
  const d = doc?.draft;
  if (!doc || !d) return true;
  const annot = { ...d.annot, text: d.annot.text.replace(/\s+$/, "") };
  if (d.existing) {
    if (!annot.text)
      return commit(docId, (c) => ({ ...c, annots: c.annots.filter((a) => a.id !== annot.id) }), {
        draft: null,
        selectedAnnot: null,
      });
    else if (d.before && sameText(annot, d.before)) {
      patchDoc(docId, { draft: null, selectedAnnot: annot.id });
      return true;
    } else
      return commit(
        docId,
        (c) => ({ ...c, annots: c.annots.map((a) => (a.id === annot.id ? annot : a)) }),
        { draft: null, selectedAnnot: annot.id },
      );
  }
  if (!annot.text || (d.cover && d.before && sameText(annot, d.before))) {
    patchDoc(docId, { draft: null });
    return true;
  }
  const added: Annot[] = d.cover ? [d.cover, annot] : [annot];
  return commit(docId, (c) => ({ ...c, annots: [...c.annots, ...added] }), {
    draft: null,
    selectedAnnot: annot.id,
  });
}

export function startNewText(docId: string, page: PageRef, x: number, y: number): void {
  if (docById(docId)?.readOnly) return;
  const style = useApp.getState().style.text;
  const annot: TextAnnot = {
    id: uid("a"),
    page: page.id,
    kind: "text",
    x,
    y: y - style.size * 0.6,
    text: "",
    ...style,
  };
  patchDoc(docId, { draft: { annot }, selectedAnnot: null });
}

export function editExistingText(docId: string, a: TextAnnot): void {
  if (docById(docId)?.readOnly || a.locked) return;
  patchDoc(docId, { draft: { annot: a, before: a, existing: true }, selectedAnnot: a.id });
}

export function updateDraft(docId: string, patch: Partial<TextAnnot>): void {
  patchDoc(docId, (d) =>
    d.draft ? { draft: { ...d.draft, annot: { ...d.draft.annot, ...patch } } } : {},
  );
}

/** Open the native content editor for the original PDF text object. */
export function startEditRun(docId: string, page: PageRef, run: TextItem): void {
  if (!finishDraft(docId)) return;
  const doc = docById(docId);
  if (!doc || doc.readOnly) return;
  useApp.setState({
    dialog: {
      kind: "localTools",
      mode: "content",
      page: doc.content.pages.findIndex((item) => item.id === page.id),
      text: run.str,
    },
  });
}

/** Turns the current text selection into highlight/underline/strike annotations, one per page. */
export function markupFromSelection(
  docId: string,
  kind: "highlight" | "underline" | "strike",
  pageEls: Map<string, HTMLElement>,
  scale: number,
): boolean {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
  const rects = [...sel.getRangeAt(0).getClientRects()];
  const color = useApp.getState().style.markup[kind];
  const added: Annot[] = [];
  for (const [pageId, el] of pageEls) {
    const pr = el.getBoundingClientRect();
    const mine: Box[] = rects
      .filter(
        (r) =>
          r.width > 0 &&
          r.top + r.height / 2 > pr.top &&
          r.top + r.height / 2 < pr.bottom &&
          r.left < pr.right &&
          r.right > pr.left,
      )
      .map((r) => ({
        x: (r.left - pr.left) / scale,
        y: (r.top - pr.top) / scale,
        w: r.width / scale,
        h: r.height / scale,
      }));
    const lines = mergeLineRects(mine);
    if (lines.length)
      added.push({
        id: uid("a"),
        page: pageId,
        kind,
        rects: lines,
        color,
        opacity: kind === "highlight" ? 1 : undefined,
      });
  }
  sel.removeAllRanges();
  if (!added.length) return false;
  commit(docId, (c) => ({ ...c, annots: [...c.annots, ...added] }), { selectedAnnot: null });
  return true;
}
