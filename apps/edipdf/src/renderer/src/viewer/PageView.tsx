import { focusOnMount, withRenderKeys } from "@informach/edi-desktop/renderer";
import { pageNumberPos } from "@shared/build";
import {
  type Annot,
  annotBounds,
  type Box,
  type NoteAnnot,
  type PageRef,
  pageLabel,
  type TextAnnot,
  translateAnnot,
  uid,
  viewSize,
} from "@shared/model";
import { Trash2, X } from "lucide-react";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { measureText } from "../lib/actions";
import {
  editExistingText,
  finishDraft,
  startEditRun,
  startNewText,
  updateDraft,
} from "../lib/editing";
import {
  joinRuns,
  pageInfo,
  renderPage,
  renderTextLayer,
  type TextItem,
  textItems,
} from "../lib/pdf";
import {
  addAnnot,
  commit,
  type DocState,
  patchDoc,
  removeAnnot,
  type Tool,
  updateAnnot,
  useApp,
} from "../state/store";
import { AnnotHtml, AnnotSvg, isSvgKind, textStyle } from "./AnnotView";
import { FormLayer } from "./FormLayer";

const DRAW_TOOLS: Tool[] = [
  "text",
  "ink",
  "rect",
  "ellipse",
  "line",
  "arrow",
  "note",
  "whiteout",
  "edittext",
  "hand",
];
const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type Handle = (typeof HANDLES)[number];

interface Props {
  doc: DocState;
  page: PageRef;
  index: number;
  scale: number;
  visible: boolean;
  registerEl: (id: string, el: HTMLElement | null) => void;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function resizeBox(b: Box, h: Handle, dx: number, dy: number, keepAspect: boolean): Box {
  let { x, y, w, h: hh } = b;
  if (h.includes("w")) {
    x = b.x + dx;
    w = b.w - dx;
  }
  if (h.includes("e")) w = b.w + dx;
  if (h.includes("n")) {
    y = b.y + dy;
    hh = b.h - dy;
  }
  if (h.includes("s")) hh = b.h + dy;
  if (keepAspect && h.length === 2 && b.w > 0 && b.h > 0) {
    const k = Math.max(w / b.w, hh / b.h);
    const nw = b.w * k;
    const nh = b.h * k;
    if (h.includes("w")) x = b.x + b.w - nw;
    if (h.includes("n")) y = b.y + b.h - nh;
    w = nw;
    hh = nh;
  }
  if (w < 4) {
    if (h.includes("w")) x = b.x + b.w - 4;
    w = 4;
  }
  if (hh < 4) {
    if (h.includes("n")) y = b.y + b.h - 4;
    hh = 4;
  }
  return { x, y, w, h: hh };
}

export const PageView = memo(function PageView({
  doc,
  page,
  index,
  scale,
  visible,
  registerEl,
}: Props) {
  const tool = useApp((s) => s.tool);
  const style = useApp((s) => s.style);
  const info = pageInfo(page);
  const { w: W, h: H } = viewSize(page, info);
  const elRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<Annot | null>(null);
  const [creating, setCreating] = useState<Annot | null>(null);
  const [runs, setRuns] = useState<TextItem[]>([]);
  const forms = doc.hasForms && page.src === doc.primary;
  const blankKey = page.blank ? `${page.blank.w}x${page.blank.h}` : "";

  useLayoutEffect(() => {
    registerEl(page.id, elRef.current);
    return () => registerEl(page.id, null);
  }, [page.id, registerEl]);

  // Page bitmap. While zooming, the previous bitmap stays stretched until the new one is ready.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!visible) {
      canvas.width = 0;
      canvas.height = 0;
      delete canvas.dataset.key;
      return;
    }
    const key = `${page.src}:${page.index}:${page.rotation}:${blankKey}`;
    const delay = canvas.dataset.key === key ? 140 : 0;
    let job: ReturnType<typeof renderPage> | null = null;
    const t = setTimeout(() => {
      job = renderPage(page, canvas, scale, { forms });
      job.done
        .then(() => (canvas.dataset.key = key))
        .catch((err) => console.error("render failed", err));
    }, delay);
    return () => {
      clearTimeout(t);
      job?.cancel();
    };
  }, [visible, page, blankKey, scale, forms]);

  // Selectable text.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.replaceChildren();
    if (!visible || page.blank) return;
    let cancel: (() => void) | null = null;
    let dead = false;
    const t = setTimeout(() => {
      renderTextLayer(page, el, scale)
        .then((c) => {
          if (dead) c();
          else cancel = c;
        })
        .catch(() => undefined);
    }, 160);
    return () => {
      dead = true;
      clearTimeout(t);
      cancel?.();
    };
  }, [visible, page, scale]);

  useEffect(() => {
    if (tool !== "edittext" || !visible || page.blank) {
      setRuns([]);
      return;
    }
    let live = true;
    void textItems(page).then((items) => live && setRuns(joinRuns(items)));
    return () => {
      live = false;
    };
  }, [tool, visible, page]);

  const annots = useMemo(
    () => doc.content.annots.filter((a) => a.page === page.id),
    [doc.content.annots, page.id],
  );
  const draft = doc.draft?.annot.page === page.id ? doc.draft : null;
  const shown = annots
    .filter((a) => !(draft?.existing && a.id === draft.annot.id))
    .map((a) => (preview && preview.id === a.id ? preview : a));
  if (creating) shown.push(creating);

  const selected =
    tool === "select" && !draft ? shown.find((a) => a.id === doc.selectedAnnot) : undefined;
  const hit = tool === "select";
  const searchHits =
    doc.search?.results.map((r, i) => ({ ...r, i })).filter((r) => r.page === page.id) ?? [];

  const toView = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const r = elRef.current!.getBoundingClientRect();
    return {
      x: clamp((e.clientX - r.left) / scale, 0, W),
      y: clamp((e.clientY - r.top) / scale, 0, H),
    };
  };

  /** Window-level drag helper: calls `move` with the pointer delta, then `end` with the last value. */
  const drag = <T,>(
    e: React.PointerEvent,
    move: (p: { x: number; y: number }, ev: PointerEvent) => T | null,
    end: (last: T | null, moved: boolean) => void,
  ): void => {
    const start = toView(e);
    let last: T | null = null;
    let moved = false;
    const onMove = (ev: PointerEvent): void => {
      const p = toView(ev);
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) * scale < 3) return;
      moved = true;
      last = move(p, ev);
    };
    const onUp = (): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      end(last, moved);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const replaceAnnot = (a: Annot): void => {
    commit(doc.id, (c) => ({ ...c, annots: c.annots.map((x) => (x.id === a.id ? a : x)) }));
  };

  const beginMove = (e: React.PointerEvent, a: Annot): void => {
    const start = toView(e);
    drag(
      e,
      (p) => {
        const next = translateAnnot(a, p.x - start.x, p.y - start.y);
        setPreview(next);
        return next;
      },
      (last, moved) => {
        setPreview(null);
        if (moved && last) replaceAnnot(last);
      },
    );
  };

  const beginHandle = (e: React.PointerEvent, a: Annot, h: string): void => {
    e.stopPropagation();
    const start = toView(e);
    drag(
      e,
      (p, ev) => {
        const dx = p.x - start.x;
        const dy = p.y - start.y;
        let next: Annot | null = null;
        if ((a.kind === "line" || a.kind === "arrow") && (h === "p1" || h === "p2"))
          next = h === "p1" ? { ...a, x1: p.x, y1: p.y } : { ...a, x2: p.x, y2: p.y };
        else if (a.kind === "rect" || a.kind === "ellipse" || a.kind === "image")
          next = {
            ...a,
            ...resizeBox(a, h as Handle, dx, dy, a.kind === "image" ? !ev.shiftKey : ev.shiftKey),
          };
        setPreview(next);
        return next;
      },
      (last, moved) => {
        setPreview(null);
        if (moved && last) replaceAnnot(last);
      },
    );
  };

  const beginCreate = (e: React.PointerEvent): void => {
    const start = toView(e);
    const s = style;
    const id = uid("a");
    const points = [start.x, start.y];
    const shapeAt = (p: { x: number; y: number }, square: boolean): Annot => {
      let w = p.x - start.x;
      let h = p.y - start.y;
      if (square) {
        const m = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * m;
        h = Math.sign(h || 1) * m;
      }
      const box = {
        x: Math.min(start.x, start.x + w),
        y: Math.min(start.y, start.y + h),
        w: Math.abs(w),
        h: Math.abs(h),
      };
      if (tool === "whiteout")
        return { id, page: page.id, kind: "rect", ...box, stroke: null, fill: "#FFFFFF", width: 0 };
      return {
        id,
        page: page.id,
        kind: tool === "ellipse" ? "ellipse" : "rect",
        ...box,
        stroke: s.shape.stroke,
        fill: s.shape.fill,
        width: s.shape.width,
        opacity: s.shape.opacity,
      };
    };
    drag<Annot>(
      e,
      (p, ev) => {
        let next: Annot;
        if (tool === "ink") {
          const lx = points[points.length - 2];
          const ly = points[points.length - 1];
          if (Math.hypot(p.x - lx, p.y - ly) * scale > 1.5) points.push(p.x, p.y);
          next = {
            id,
            page: page.id,
            kind: "ink",
            paths: [points.slice()],
            stroke: s.ink.stroke,
            width: s.ink.width,
            opacity: s.ink.opacity,
          };
        } else if (tool === "line" || tool === "arrow") {
          let { x, y } = p;
          if (ev.shiftKey) {
            const ang =
              Math.round(Math.atan2(y - start.y, x - start.x) / (Math.PI / 4)) * (Math.PI / 4);
            const len = Math.hypot(x - start.x, y - start.y);
            x = start.x + Math.cos(ang) * len;
            y = start.y + Math.sin(ang) * len;
          }
          next = {
            id,
            page: page.id,
            kind: tool,
            x1: start.x,
            y1: start.y,
            x2: x,
            y2: y,
            stroke: s.line.stroke,
            width: s.line.width,
            opacity: s.line.opacity,
          };
        } else next = shapeAt(p, ev.shiftKey);
        setCreating(next);
        return next;
      },
      (last, moved) => {
        setCreating(null);
        if (moved && last) {
          const b = annotBounds(last);
          if (last.kind === "ink" || b.w > 3 || b.h > 3) addAnnot(doc.id, last, false);
        } else if (!moved && (tool === "rect" || tool === "ellipse")) {
          addAnnot(
            doc.id,
            { ...(shapeAt({ x: start.x + 120, y: start.y + 80 }, false) as Annot) },
            false,
          );
        }
      },
    );
  };

  const onLayerPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const annotEl = target.closest("[data-annot]") as HTMLElement | null;
    const annot = annotEl ? annots.find((a) => a.id === annotEl.dataset.annot) : undefined;
    if (tool === "select" && annot) {
      e.preventDefault();
      patchDoc(doc.id, { selectedAnnot: annot.id, openNote: null });
      beginMove(e, annot);
      return;
    }
    if ((tool === "text" || tool === "edittext") && annot?.kind === "text") {
      e.preventDefault();
      editExistingText(doc.id, annot);
      return;
    }
    if (target.closest(".text-draft, .note-pop, .edit-run")) return;
    const p = toView(e);
    switch (tool) {
      case "text":
        e.preventDefault();
        startNewText(doc.id, page, p.x, p.y);
        return;
      case "note": {
        e.preventDefault();
        const n: NoteAnnot = {
          id: uid("a"),
          page: page.id,
          kind: "note",
          x: p.x - 11,
          y: p.y - 11,
          text: "",
          color: style.note.color,
        };
        addAnnot(doc.id, n);
        patchDoc(doc.id, { openNote: n.id });
        return;
      }
      case "ink":
      case "rect":
      case "ellipse":
      case "line":
      case "arrow":
      case "whiteout":
        e.preventDefault();
        beginCreate(e);
        return;
    }
  };

  const onLayerDoubleClick = (e: React.MouseEvent): void => {
    if (tool !== "select") return;
    const annotEl = (e.target as HTMLElement).closest("[data-annot]") as HTMLElement | null;
    const annot = annotEl ? annots.find((a) => a.id === annotEl.dataset.annot) : undefined;
    if (annot?.kind === "text") editExistingText(doc.id, annot);
    if (annot?.kind === "note") patchDoc(doc.id, { openNote: annot.id });
  };

  // Clicking empty page space with the select tool clears the annotation selection.
  const onPagePointerDown = (e: React.PointerEvent): void => {
    if (tool !== "select" || !doc.selectedAnnot) return;
    if ((e.target as HTMLElement).closest("[data-annot], [data-handle], .note-pop")) return;
    patchDoc(doc.id, { selectedAnnot: null });
  };

  const layerActive = DRAW_TOOLS.includes(tool) && tool !== "hand";
  const svgAnnots = shown.filter(isSvgKind);
  const sel = selected
    ? annotBounds(selected, selected.kind === "text" ? measureText(selected) : undefined)
    : null;
  const openNote = annots.find((a): a is NoteAnnot => a.id === doc.openNote && a.kind === "note");
  const wm = doc.content.watermark;
  const pn = doc.content.pageNumbers;

  return (
    <div
      ref={elRef}
      className={`page${index === doc.currentPage ? " current" : ""}`}
      data-page={page.id}
      style={{ width: W * scale, height: H * scale, ["--total-scale-factor" as string]: scale }}
      onPointerDown={onPagePointerDown}
    >
      <canvas
        ref={canvasRef}
        className="page-canvas"
        style={{ width: W * scale, height: H * scale }}
      />
      <div
        ref={textRef}
        className={`textLayer${tool === "select" || tool === "highlight" || tool === "underline" || tool === "strike" ? "" : " inert"}`}
      />
      {visible && forms && <FormLayer doc={doc} page={page} scale={scale} />}

      {visible && (
        <div className="stamp-layer">
          {wm?.text && (
            <div
              className="stamp-watermark"
              style={{
                left: (W / 2) * scale,
                top: (H / 2) * scale,
                fontSize: wm.size * scale,
                color: wm.color,
                opacity: wm.opacity,
                transform: `translate(-50%, -50%) rotate(${-wm.angle}deg)`,
              }}
            >
              {wm.text}
            </div>
          )}
          {pn && (
            <PageNumberPreview
              pn={pn}
              n={index + pn.start}
              total={doc.content.pages.length + pn.start - 1}
              W={W}
              H={H}
              scale={scale}
            />
          )}
          {searchHits.map((r) =>
            withRenderKeys(r.rects, (rect) => JSON.stringify(rect)).map(({ key, value: b }) => (
              <div
                key={`${r.i}-${key}`}
                className={`search-hit${r.i === doc.search?.index ? " current" : ""}`}
                style={{
                  left: b.x * scale,
                  top: b.y * scale,
                  width: b.w * scale,
                  height: b.h * scale,
                }}
              />
            )),
          )}
        </div>
      )}

      {/* Highlights sit outside the annotation layer (its z-index isolates blending) so multiply mixes with the page. */}
      <svg
        className="annot-svg blend"
        viewBox={`0 0 ${W} ${H}`}
        width={W * scale}
        height={H * scale}
        onPointerDown={onLayerPointerDown}
        onDoubleClick={onLayerDoubleClick}
      >
        <title>Destaques do documento</title>
        {svgAnnots
          .filter((a) => a.kind === "highlight")
          .map((a) => (
            <AnnotSvg key={a.id} a={a} hit={hit} />
          ))}
      </svg>
      <div
        className={`annot-layer tool-${tool}`}
        role="application"
        aria-label="Anotações da página"
        style={{ pointerEvents: layerActive ? "auto" : "none" }}
        onPointerDown={onLayerPointerDown}
        onDoubleClick={onLayerDoubleClick}
      >
        {withRenderKeys(runs, (run) => JSON.stringify(run)).map(({ key, value: r }) => (
          <div
            key={key}
            className="edit-run"
            style={{
              left: r.box.x * scale - 2,
              top: r.box.y * scale - 2,
              width: r.box.w * scale + 4,
              height: r.box.h * scale + 4,
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const canvas = canvasRef.current;
              startEditRun(
                doc.id,
                page,
                r,
                canvas,
                canvas && canvas.width ? canvas.width / W : scale * devicePixelRatio,
              );
            }}
          />
        ))}
        <svg className="annot-svg" viewBox={`0 0 ${W} ${H}`} width={W * scale} height={H * scale}>
          <title>Anotações vetoriais</title>
          {draft?.cover && <AnnotSvg a={draft.cover} />}
          {svgAnnots
            .filter((a) => a.kind !== "highlight")
            .map((a) => (
              <AnnotSvg key={a.id} a={a} hit={hit} />
            ))}
        </svg>
        {shown
          .filter((a) => !isSvgKind(a))
          .map((a) => (
            <AnnotHtml
              key={a.id}
              a={a}
              scale={scale}
              hit={hit || ((tool === "text" || tool === "edittext") && a.kind === "text")}
              onNoteClick={() => patchDoc(doc.id, { openNote: a.id })}
            />
          ))}
        {draft && (
          <TextDraftEditor key={draft.annot.id} docId={doc.id} annot={draft.annot} scale={scale} />
        )}
        {sel && selected && (
          <SelectionBox
            a={selected}
            box={sel}
            scale={scale}
            onHandle={(e, h) => beginHandle(e, selected, h)}
          />
        )}
        {openNote && <NotePopover docId={doc.id} note={openNote} scale={scale} W={W} />}
      </div>
    </div>
  );
});

function PageNumberPreview({
  pn,
  n,
  total,
  W,
  H,
  scale,
}: {
  pn: NonNullable<DocState["content"]["pageNumbers"]>;
  n: number;
  total: number;
  W: number;
  H: number;
  scale: number;
}): React.ReactElement {
  const label = pageLabel(n, total, pn.format);
  const w = measureText({ text: label, font: "helvetica", size: pn.size }).w;
  const { x, y } = pageNumberPos(pn.position, W, H, w, pn.size);
  return (
    <div
      className="stamp-number"
      style={{
        left: x * scale,
        top: (y - pn.size * 0.9465) * scale,
        fontSize: pn.size * scale,
        color: pn.color,
      }}
    >
      {label}
    </div>
  );
}

function SelectionBox({
  a,
  box,
  scale,
  onHandle,
}: {
  a: Annot;
  box: Box;
  scale: number;
  onHandle: (e: React.PointerEvent, h: string) => void;
}): React.ReactElement {
  const pad = 3;
  const resizable = a.kind === "rect" || a.kind === "ellipse" || a.kind === "image";
  const isLine = a.kind === "line" || a.kind === "arrow";
  return (
    <>
      {!isLine && (
        <div
          className="sel-box"
          style={{
            left: box.x * scale - pad,
            top: box.y * scale - pad,
            width: box.w * scale + pad * 2,
            height: box.h * scale + pad * 2,
          }}
        />
      )}
      {resizable &&
        HANDLES.map((h) => {
          const x = h.includes("w") ? box.x : h.includes("e") ? box.x + box.w : box.x + box.w / 2;
          const y = h.includes("n") ? box.y : h.includes("s") ? box.y + box.h : box.y + box.h / 2;
          return (
            <div
              key={h}
              data-handle={h}
              className={`sel-handle h-${h}`}
              style={{ left: x * scale, top: y * scale }}
              onPointerDown={(e) => onHandle(e, h)}
            />
          );
        })}
      {isLine &&
        (["p1", "p2"] as const).map((h) => (
          <div
            key={h}
            data-handle={h}
            className="sel-handle h-point"
            style={{
              left: (h === "p1" ? a.x1 : a.x2) * scale,
              top: (h === "p1" ? a.y1 : a.y2) * scale,
            }}
            onPointerDown={(e) => onHandle(e, h)}
          />
        ))}
    </>
  );
}

function TextDraftEditor({
  docId,
  annot,
  scale,
}: {
  docId: string;
  annot: TextAnnot;
  scale: number;
}): React.ReactElement {
  const ref = useRef<HTMLTextAreaElement>(null);
  const initialText = useRef(annot.text);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = `${el.scrollHeight}px`;
    // Only on mount: later text changes come from the user typing in this element.
  }, []);
  return (
    <textarea
      ref={ref}
      className="text-draft"
      aria-label="Texto da anotação"
      defaultValue={initialText.current}
      rows={1}
      spellCheck={false}
      style={{
        left: annot.x * scale,
        top: annot.y * scale,
        minWidth: annot.size * scale * 0.6,
        ...textStyle(annot, scale),
        opacity: 1,
      }}
      onInput={(e) => {
        updateDraft(docId, { text: e.currentTarget.value });
        e.currentTarget.style.height = "auto";
        e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          finishDraft(docId);
        }
        if (!(e.ctrlKey || e.metaKey) || !["s", "p", "w", "o"].includes(e.key.toLowerCase()))
          e.stopPropagation();
      }}
    />
  );
}

const NOTE_COLORS = ["#F59E0B", "#FACC15", "#22C55E", "#3B82F6", "#EC4899"];

function NotePopover({
  docId,
  note,
  scale,
  W,
}: {
  docId: string;
  note: NoteAnnot;
  scale: number;
  W: number;
}): React.ReactElement {
  const [text, setText] = useState(note.text);
  const close = (): void => {
    if (!text.trim()) removeAnnot(docId, note.id);
    else {
      if (text !== note.text) updateAnnot(docId, note.id, { text });
      patchDoc(docId, { openNote: null });
    }
  };
  const left = Math.min((note.x + 26) * scale, W * scale - 250);
  return (
    <div
      className="note-pop"
      style={{ left: Math.max(4, left), top: note.y * scale }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="note-pop-head">
        <span>Comentário</span>
        <div className="note-colors">
          {NOTE_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              className={`swatch sm${c === note.color ? " on" : ""}`}
              style={{ background: c }}
              onClick={() => updateAnnot(docId, note.id, { color: c })}
            />
          ))}
        </div>
        <button
          type="button"
          className="icon-btn sm"
          title="Excluir comentário"
          onClick={() => removeAnnot(docId, note.id)}
        >
          <Trash2 size={13} />
        </button>
        <button type="button" className="icon-btn sm" title="Fechar" onClick={close}>
          <X size={13} />
        </button>
      </div>
      <textarea
        ref={focusOnMount}
        value={text}
        placeholder="Escreva um comentário…"
        onChange={(e) => {
          setText(e.target.value);
          updateAnnot(docId, note.id, { text: e.target.value });
        }}
        onKeyDown={(e) => {
          if (!(e.ctrlKey || e.metaKey) || !["s", "p", "w", "o"].includes(e.key.toLowerCase()))
            e.stopPropagation();
          if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) close();
        }}
      />
    </div>
  );
}
