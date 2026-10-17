import {
  type Annot,
  BASELINE,
  type Box,
  mergeLineRects,
  type PageRef,
  type ShapeAnnot,
  type TextAnnot,
  uid,
} from "@shared/model";
import { commit, type DocState, patchDoc, useApp } from "../state/store";
import type { TextItem } from "./pdf";

const docById = (id: string): DocState | undefined =>
  useApp.getState().docs.find((d) => d.id === id);

const sameText = (a: TextAnnot, b: TextAnnot): boolean =>
  a.text === b.text &&
  a.font === b.font &&
  a.size === b.size &&
  a.color === b.color &&
  !!a.bold === !!b.bold &&
  !!a.italic === !!b.italic &&
  a.x === b.x &&
  a.y === b.y &&
  a.opacity === b.opacity;

/** Ends text editing, turning the draft into one undoable change (or none). */
export function finishDraft(docId: string): void {
  const doc = docById(docId);
  const d = doc?.draft;
  if (!doc || !d) return;
  const annot = { ...d.annot, text: d.annot.text.replace(/\s+$/, "") };
  if (d.existing) {
    if (!annot.text)
      commit(docId, (c) => ({ ...c, annots: c.annots.filter((a) => a.id !== annot.id) }), {
        draft: null,
        selectedAnnot: null,
      });
    else if (d.before && sameText(annot, d.before))
      patchDoc(docId, { draft: null, selectedAnnot: annot.id });
    else
      commit(
        docId,
        (c) => ({ ...c, annots: c.annots.map((a) => (a.id === annot.id ? annot : a)) }),
        { draft: null, selectedAnnot: annot.id },
      );
    return;
  }
  if (!annot.text || (d.cover && d.before && sameText(annot, d.before))) {
    patchDoc(docId, { draft: null });
    return;
  }
  const added: Annot[] = d.cover ? [d.cover, annot] : [annot];
  commit(docId, (c) => ({ ...c, annots: [...c.annots, ...added] }), {
    draft: null,
    selectedAnnot: annot.id,
  });
}

export function startNewText(docId: string, page: PageRef, x: number, y: number): void {
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
  patchDoc(docId, { draft: { annot: a, before: a, existing: true }, selectedAnnot: a.id });
}

export function updateDraft(docId: string, patch: Partial<TextAnnot>): void {
  patchDoc(docId, (d) =>
    d.draft ? { draft: { ...d.draft, annot: { ...d.draft.annot, ...patch } } } : {},
  );
}

const hex = (r: number, g: number, b: number): string =>
  "#" +
  [r, g, b]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

/**
 * Samples the rendered page around and inside a text run to guess its background and ink colours.
 * `scale` is canvas pixels per point.
 */
export function sampleColors(
  canvas: HTMLCanvasElement | null,
  box: Box,
  scale: number,
): { bg: string; ink: string } {
  const fallback = { bg: "#FFFFFF", ink: "#111111" };
  const ctx = canvas?.getContext("2d", { willReadFrequently: true });
  if (!canvas || !ctx || !canvas.width) return fallback;
  const pad = 2;
  const x0 = Math.max(0, Math.floor((box.x - pad) * scale));
  const y0 = Math.max(0, Math.floor((box.y - pad) * scale));
  const x1 = Math.min(canvas.width, Math.ceil((box.x + box.w + pad) * scale));
  const y1 = Math.min(canvas.height, Math.ceil((box.y + box.h + pad) * scale));
  if (x1 - x0 < 2 || y1 - y0 < 2) return fallback;
  const img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  const w = img.width;
  const h = img.height;
  const px = (x: number, y: number): [number, number, number] => {
    const i = (y * w + x) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  };
  // Background: most common colour along the border of the padded box.
  const counts = new Map<string, { n: number; c: [number, number, number] }>();
  const vote = (c: [number, number, number]) => {
    const k = c.map((v) => v >> 4).join(",");
    const e = counts.get(k);
    if (e) e.n++;
    else counts.set(k, { n: 1, c });
  };
  for (let x = 0; x < w; x++) {
    vote(px(x, 0));
    vote(px(x, h - 1));
  }
  for (let y = 0; y < h; y++) {
    vote(px(0, y));
    vote(px(w - 1, y));
  }
  const bg = [...counts.values()].sort((a, b) => b.n - a.n)[0]?.c ?? [255, 255, 255];
  // Ink: the pixel inside that differs most from the background.
  let best = 0;
  let ink: [number, number, number] = [17, 17, 17];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const c = px(x, y);
      const d = Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]);
      if (d > best) {
        best = d;
        ink = c;
      }
    }
  return { bg: hex(...bg), ink: best > 60 ? hex(...ink) : "#111111" };
}

/** "Editar texto": hides a line of the original text and opens an editable copy on top of it. */
export function startEditRun(
  docId: string,
  page: PageRef,
  run: TextItem,
  canvas: HTMLCanvasElement | null,
  canvasScale: number,
): void {
  const { bg, ink } = sampleColors(canvas, run.box, canvasScale);
  const size = Math.round(run.size * 10) / 10;
  const cover: ShapeAnnot = {
    id: uid("a"),
    page: page.id,
    kind: "rect",
    x: run.box.x - 1,
    y: run.box.y - 1,
    w: run.box.w + 2,
    h: run.box.h + 2,
    stroke: null,
    fill: bg,
    width: 0,
  };
  const annot: TextAnnot = {
    id: uid("a"),
    page: page.id,
    kind: "text",
    x: run.box.x,
    y: run.baseline - BASELINE[run.font] * size,
    text: run.str.trim(),
    font: run.font,
    size,
    color: ink,
    bold: run.bold,
    italic: run.italic,
  };
  patchDoc(docId, { draft: { annot, cover, before: annot }, selectedAnnot: null });
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
