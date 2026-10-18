import { focusOnMount, withRenderKeys } from "@informach/edi-desktop/renderer";
import { pickAnnotationSelection } from "@shared/annotation-commands";
import {
  type Annot,
  annotBounds,
  type Box,
  type NoteAnnot,
  type PageRef,
  type ParagraphAnnot,
  type TextAnnot,
  translateAnnot,
  uid,
  viewSize,
} from "@shared/model";
import { paragraphFontBytes } from "@shared/paragraph-font";
import { Trash2, X } from "lucide-react";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { measureText } from "../lib/actions";
import { annotationAction, selectedAnnotations } from "../lib/annotations";
import {
  editExistingText,
  finishDraft,
  startEditRun,
  startNewText,
  updateDraft,
} from "../lib/editing";
import { localFonts } from "../lib/fonts";
import { isDocumentShortcut } from "../lib/keyboard";
import { paragraphLayoutInWorker } from "../lib/paragraph-layout";
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
  toast,
  updateAnnot,
  useApp,
} from "../state/store";
import { AnnotHtml, AnnotSvg, isSvgKind, textStyle } from "./AnnotView";
import { DecorationsLayer } from "./DecorationsLayer";
import { FormLayer } from "./FormLayer";
import { LinkLayer } from "./LinkLayer";

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
const RESIZE_BUSY = "Conferindo caixa de texto… Esc cancela.";
type Handle = (typeof HANDLES)[number];
type SelectionHandle = Handle | "p1" | "p2";
const HANDLE_LABELS: Record<Handle, string> = {
  nw: "canto superior esquerdo",
  n: "borda superior",
  ne: "canto superior direito",
  e: "borda direita",
  se: "canto inferior direito",
  s: "borda inferior",
  sw: "canto inferior esquerdo",
  w: "borda esquerda",
};

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
  const dragCleanup = useRef<(() => void) | null>(null),
    resizeController = useRef<AbortController | null>(null),
    interactionOwner = useRef({ docId: doc.id, pageId: page.id, revision: doc.content });
  const [validatingResize, setValidatingResize] = useState(false);
  const [movePreview, setMovePreview] = useState<Annot[]>([]);
  const [creating, setCreating] = useState<Annot | null>(null);
  const [pageErrors, setPageErrors] = useState<{ render?: string; text?: string }>({});
  const [renderAttempt, setRenderAttempt] = useState(0);
  const [limitedPreview, setLimitedPreview] = useState(false);
  const [runs, setRuns] = useState<TextItem[]>([]);
  const forms = doc.hasForms && !!page.src;
  const blankKey = page.blank ? `${page.blank.w}x${page.blank.h}` : "";

  useLayoutEffect(() => {
    const owner = { docId: doc.id, pageId: page.id, revision: doc.content };
    interactionOwner.current = owner;
    setPreview(null);
    setMovePreview((previous) => (previous.length ? [] : previous));
    setCreating(null);
    setValidatingResize(false);
    return () => {
      if (interactionOwner.current !== owner) return;
      dragCleanup.current?.();
      dragCleanup.current = null;
      resizeController.current?.abort();
      if (resizeController.current && useApp.getState().busy === RESIZE_BUSY)
        useApp.setState({ busy: null });
      resizeController.current = null;
    };
  }, [doc.id, doc.content, page.id]);

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
    const key = `${page.src}:${page.index}:${page.rotation}:${blankKey}:${renderAttempt}`;
    const delay = canvas.dataset.key === key ? 140 : 0;
    let job: ReturnType<typeof renderPage> | null = null;
    let dead = false;
    setPageErrors((errors) => ({ ...errors, render: undefined }));
    const t = setTimeout(() => {
      job = renderPage(page, canvas, scale, { forms });
      job.done
        .then(() => {
          if (!dead) {
            canvas.dataset.key = key;
            setLimitedPreview(canvas.dataset.quality === "limited");
          }
        })
        .catch((error) => {
          if (!dead)
            setPageErrors((errors) => ({
              ...errors,
              render: error instanceof Error ? error.message : "Falha ao desenhar a página.",
            }));
        });
    }, delay);
    return () => {
      clearTimeout(t);
      dead = true;
      job?.cancel();
    };
  }, [visible, page, blankKey, scale, forms, renderAttempt]);

  // Selectable text.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const key = `${page.src}:${page.index}:${page.rotation}:${scale}:${renderAttempt}`;
    if (visible && el.dataset.key === key && el.hasChildNodes()) return;
    el.replaceChildren();
    delete el.dataset.key;
    if (!visible || page.blank) return;
    let cancel: (() => void) | null = null;
    let dead = false;
    setPageErrors((errors) => ({ ...errors, text: undefined }));
    const t = setTimeout(() => {
      renderTextLayer(page, el, scale)
        .then((c) => {
          if (dead) c();
          else {
            cancel = c;
            el.dataset.key = key;
          }
        })
        .catch((error) => {
          if (!dead)
            setPageErrors((errors) => ({
              ...errors,
              text: error instanceof Error ? error.message : "Texto selecionável indisponível.",
            }));
        });
    }, 160);
    return () => {
      dead = true;
      clearTimeout(t);
      cancel?.();
    };
  }, [visible, page, scale, renderAttempt]);

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
    .map(
      (a) =>
        movePreview.find((item) => item.id === a.id) ??
        (preview && preview.id === a.id ? preview : a),
    );
  if (creating) shown.push(creating);

  const selected =
    tool === "select" && !draft && !doc.reading
      ? shown.find((a) => a.id === doc.selectedAnnot)
      : undefined;
  const hit = tool === "select" && !doc.reading;
  const searchHits =
    doc.search?.results.map((r, i) => ({ ...r, i })).filter((r) => r.page === page.id) ?? [];

  const toView = (e: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    const element = elRef.current;
    if (!element) return null;
    const r = element.getBoundingClientRect();
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
    dragCleanup.current?.();
    setPreview(null);
    setMovePreview([]);
    setCreating(null);
    const start = toView(e);
    if (!start) return;
    const pointer = e.pointerId,
      owner = interactionOwner.current;
    let last: T | null = null;
    let moved = false;
    const onMove = (ev: PointerEvent): void => {
      if (ev.pointerId !== pointer) return;
      const p = toView(ev);
      if (!p) {
        cancel();
        return;
      }
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) * scale < 3) return;
      moved = true;
      last = move(p, ev);
    };
    const cleanup = (): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", cancel);
      if (dragCleanup.current === cleanup) dragCleanup.current = null;
    };
    const cancel = (): void => {
      cleanup();
      setPreview(null);
      setMovePreview([]);
      setCreating(null);
    };
    const onCancel = (event: PointerEvent): void => {
      if (event.pointerId === pointer) cancel();
    };
    const onUp = (event: PointerEvent): void => {
      if (event.pointerId !== pointer) return;
      cleanup();
      const current = useApp.getState().docs.find((item) => item.id === doc.id);
      if (
        !current ||
        interactionOwner.current !== owner ||
        current.content !== owner.revision ||
        current.readOnly ||
        useApp.getState().activeId !== owner.docId
      ) {
        cancel();
        return;
      }
      end(last, moved);
    };
    dragCleanup.current = cleanup;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", cancel);
  };

  const replaceAnnot = (a: Annot): void => {
    commit(doc.id, (c) => ({ ...c, annots: c.annots.map((x) => (x.id === a.id ? a : x)) }));
  };

  const resizeParagraph = async (annotation: ParagraphAnnot): Promise<void> => {
    if (useApp.getState().busy && !resizeController.current) return;
    const controller = new AbortController(),
      owner = interactionOwner.current;
    resizeController.current?.abort();
    resizeController.current = controller;
    setPreview(annotation);
    setValidatingResize(true);
    useApp.setState({ busy: RESIZE_BUSY });
    const onResizeEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        controller.abort();
      }
    };
    window.addEventListener("keydown", onResizeEscape, true);
    try {
      if (
        annotation.x < 0 ||
        annotation.y < 0 ||
        annotation.x + annotation.w > W + 0.01 ||
        annotation.y + annotation.h > H + 0.01
      )
        throw new Error("A caixa de texto precisa permanecer dentro da página.");
      const fonts = await localFonts();
      controller.signal.throwIfAborted();
      await paragraphLayoutInWorker(
        annotation,
        paragraphFontBytes(annotation, fonts),
        controller.signal,
      );
      controller.signal.throwIfAborted();
      const current = useApp.getState().docs.find((item) => item.id === doc.id),
        original = current?.content.annots.find((item) => item.id === annotation.id);
      if (
        !current ||
        interactionOwner.current !== owner ||
        current.content !== owner.revision ||
        !original ||
        original.kind !== "paragraph" ||
        original.locked ||
        current.readOnly
      )
        throw new Error("A caixa mudou durante a composição. Ajuste novamente.");
      replaceAnnot(annotation);
    } catch (failure) {
      if (!controller.signal.aborted)
        toast(
          failure instanceof Error ? failure.message : "Não foi possível redimensionar a caixa.",
          { tone: "error" },
        );
    } finally {
      window.removeEventListener("keydown", onResizeEscape, true);
      if (resizeController.current === controller) {
        resizeController.current = null;
        setPreview(null);
        setValidatingResize(false);
        if (useApp.getState().busy === RESIZE_BUSY) useApp.setState({ busy: null });
      }
    }
  };

  const beginMove = (e: React.PointerEvent, a: Annot): void => {
    if (a.locked || doc.readOnly || validatingResize) return;
    const selected = selectedAnnotations(
      useApp.getState().docs.find((docState) => docState.id === doc.id) ?? doc,
    );
    if (selected.length > 1) {
      const originals = doc.content.annots.filter((annot) => selected.includes(annot.id));
      if (originals.some((annot) => annot.locked || annot.page !== page.id)) return;
      const start = toView(e);
      if (!start) return;
      drag(
        e,
        (point) => {
          const dx = point.x - start.x,
            dy = point.y - start.y;
          setMovePreview(originals.map((annot) => translateAnnot(annot, dx, dy)));
          return { dx, dy };
        },
        (last, moved) => {
          setMovePreview([]);
          if (moved && last) annotationAction(doc.id, { kind: "move", ids: selected, ...last });
        },
      );
      return;
    }
    const start = toView(e);
    if (!start) return;
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

  const beginHandle = (e: React.PointerEvent, a: Annot, h: SelectionHandle): void => {
    if (
      a.locked ||
      validatingResize ||
      doc.readOnly ||
      doc.reading ||
      selectedAnnotations(doc).length > 1
    )
      return;
    e.stopPropagation();
    const start = toView(e);
    if (!start) return;
    drag(
      e,
      (p, ev) => {
        const dx = p.x - start.x;
        const dy = p.y - start.y;
        let next: Annot | null = null;
        if ((a.kind === "line" || a.kind === "arrow") && (h === "p1" || h === "p2"))
          next = h === "p1" ? { ...a, x1: p.x, y1: p.y } : { ...a, x2: p.x, y2: p.y };
        else if (
          (a.kind === "rect" ||
            a.kind === "ellipse" ||
            a.kind === "image" ||
            a.kind === "paragraph") &&
          h !== "p1" &&
          h !== "p2"
        )
          next = {
            ...a,
            ...resizeBox(a, h, dx, dy, a.kind === "image" ? !ev.shiftKey : ev.shiftKey),
          };
        setPreview(next);
        return next;
      },
      (last, moved) => {
        if (moved && last?.kind === "paragraph") void resizeParagraph(last);
        else {
          setPreview(null);
          if (moved && last) replaceAnnot(last);
        }
      },
    );
  };

  const keyboardHandle = (event: React.KeyboardEvent, a: Annot, handle: Handle): void => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (a.locked || doc.readOnly || doc.reading || selectedAnnotations(doc).length > 1) return;
    if (a.kind !== "rect" && a.kind !== "ellipse" && a.kind !== "image" && a.kind !== "paragraph")
      return;
    const step = event.shiftKey ? 10 : 1,
      dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
      dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0,
      next = { ...a, ...resizeBox(a, handle, dx, dy, a.kind === "image") };
    if (next.kind === "paragraph") void resizeParagraph(next);
    else replaceAnnot(next);
  };

  const beginCreate = (e: React.PointerEvent): void => {
    const start = toView(e);
    if (!start) return;
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
    if (doc.reading) return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const annotEl = target.closest("[data-annot]") as HTMLElement | null;
    const annot = annotEl ? annots.find((a) => a.id === annotEl.dataset.annot) : undefined;
    if (tool === "select" && annot) {
      e.preventDefault();
      const selection = pickAnnotationSelection(annots, annot.id, selectedAnnotations(doc), {
        additive: e.shiftKey,
        insideGroup: e.altKey,
      });
      patchDoc(doc.id, {
        selectedAnnot: selection[0] ?? null,
        selectedAnnots: selection,
        openNote: null,
      });
      if (e.shiftKey) return;
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
    if (!p) return;
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
    if (doc.reading) return;
    if (tool !== "select") return;
    const annotEl = (e.target as HTMLElement).closest("[data-annot]") as HTMLElement | null;
    const annot = annotEl ? annots.find((a) => a.id === annotEl.dataset.annot) : undefined;
    if (annot?.kind === "text") editExistingText(doc.id, annot);
    if (annot?.kind === "paragraph" && !annot.locked && !doc.readOnly)
      useApp.setState({ dialog: { kind: "paragraph", annotId: annot.id } });
    if (annot?.kind === "note") patchDoc(doc.id, { openNote: annot.id });
  };

  // Clicking empty page space with the select tool clears the annotation selection.
  const onPagePointerDown = (e: React.PointerEvent): void => {
    if (tool !== "select" || !doc.selectedAnnot) return;
    if ((e.target as HTMLElement).closest("[data-annot], [data-handle], .note-pop")) return;
    patchDoc(doc.id, { selectedAnnot: null });
  };

  const layerActive = !doc.reading && DRAW_TOOLS.includes(tool) && tool !== "hand";
  const sel =
    selected && !selected.locked && selectedAnnotations(doc).length <= 1
      ? annotBounds(selected, selected.kind === "text" ? measureText(selected) : undefined)
      : null;
  const openNote = annots.find((a): a is NoteAnnot => a.id === doc.openNote && a.kind === "note");

  return (
    <div
      ref={elRef}
      className={`page${index === doc.currentPage ? " current" : ""}`}
      data-page={page.id}
      style={{ width: W * scale, height: H * scale, ["--total-scale-factor" as string]: scale }}
      onPointerDown={onPagePointerDown}
    >
      {(pageErrors.render || pageErrors.text) && (
        <div className="page-warning" role="alert">
          {pageErrors.render || pageErrors.text}{" "}
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setRenderAttempt((attempt) => attempt + 1)}
          >
            Tentar novamente
          </button>
        </div>
      )}
      {limitedPreview && !pageErrors.render && (
        <span className="page-resolution-note">Prévia com resolução reduzida neste zoom.</span>
      )}
      <canvas
        ref={canvasRef}
        className="page-canvas"
        style={{ width: W * scale, height: H * scale }}
      />
      <div
        ref={textRef}
        className={`textLayer${tool === "select" || tool === "highlight" || tool === "underline" || tool === "strike" ? "" : " inert"}`}
      />
      {visible && (doc.reading || tool === "select" || tool === "hand") && (
        <LinkLayer doc={doc} page={page} scale={scale} />
      )}
      {visible && forms && <FormLayer doc={doc} page={page} scale={scale} />}

      {visible && (
        <div className="stamp-layer">
          <DecorationsLayer doc={doc} page={page} width={W} height={H} />
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

      <div
        className={`annot-layer tool-${tool}`}
        role="application"
        aria-label="Anotações da página"
        style={{ pointerEvents: layerActive ? "auto" : "none" }}
        onPointerDown={onLayerPointerDown}
        onDoubleClick={onLayerDoubleClick}
      >
        {shown
          .filter(
            (annot) =>
              selectedAnnotations(doc).includes(annot.id) &&
              (selectedAnnotations(doc).length > 1 || annot.locked),
          )
          .map((annot) => {
            const box = annotBounds(annot, annot.kind === "text" ? measureText(annot) : undefined);
            return (
              <div
                key={`selection:${annot.id}`}
                className="multi-selection-box"
                style={{
                  left: box.x * scale - 2,
                  top: box.y * scale - 2,
                  width: box.w * scale + 4,
                  height: box.h * scale + 4,
                  borderStyle: annot.locked ? "dashed" : "solid",
                }}
              />
            );
          })}
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
              startEditRun(doc.id, page, r);
            }}
          />
        ))}
        {draft?.cover && (
          <svg className="annot-svg" viewBox={`0 0 ${W} ${H}`} width={W * scale} height={H * scale}>
            <title>Cobertura do rascunho</title>
            <AnnotSvg a={draft.cover} />
          </svg>
        )}
        {shown.map((a, order) =>
          isSvgKind(a) ? (
            <svg
              key={a.id}
              className="annot-svg"
              viewBox={`0 0 ${W} ${H}`}
              width={W * scale}
              height={H * scale}
              style={{
                zIndex: order + 3,
                mixBlendMode: a.kind === "highlight" ? "multiply" : undefined,
              }}
            >
              <title>Anotação {a.kind}</title>
              <AnnotSvg a={a} hit={hit} />
            </svg>
          ) : (
            <AnnotHtml
              key={a.id}
              a={a}
              scale={scale}
              zIndex={order + 3}
              selectable={doc.reading || ["highlight", "underline", "strike"].includes(tool)}
              hit={hit || ((tool === "text" || tool === "edittext") && a.kind === "text")}
              onNoteClick={() => patchDoc(doc.id, { openNote: a.id })}
            />
          ),
        )}
        {draft && (
          <TextDraftEditor key={draft.annot.id} docId={doc.id} annot={draft.annot} scale={scale} />
        )}
        {sel && selected && (
          <SelectionBox
            a={selected}
            box={sel}
            scale={scale}
            onHandle={(e, h) => beginHandle(e, selected, h)}
            onKeyboardHandle={(event, handle) => keyboardHandle(event, selected, handle)}
            disabled={doc.readOnly || selected.locked || selectedAnnotations(doc).length > 1}
            busy={validatingResize}
          />
        )}
        {openNote && <NotePopover docId={doc.id} note={openNote} scale={scale} W={W} />}
      </div>
    </div>
  );
});

function SelectionBox({
  a,
  box,
  scale,
  onHandle,
  onKeyboardHandle,
  disabled,
  busy,
}: {
  a: Annot;
  box: Box;
  scale: number;
  onHandle: (e: React.PointerEvent, h: SelectionHandle) => void;
  onKeyboardHandle: (e: React.KeyboardEvent, h: Handle) => void;
  disabled?: boolean;
  busy?: boolean;
}): React.ReactElement {
  const pad = 3;
  const resizable =
    a.kind === "rect" || a.kind === "ellipse" || a.kind === "image" || a.kind === "paragraph";
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
            <button
              type="button"
              key={h}
              aria-label={`Redimensionar: ${HANDLE_LABELS[h]}`}
              title="Arraste ou use as setas. Shift ajusta 10 pontos."
              disabled={disabled}
              aria-busy={busy}
              data-handle={h}
              className={`sel-handle h-${h}`}
              style={{ left: x * scale, top: y * scale }}
              onPointerDown={(e) => onHandle(e, h)}
              onKeyDown={(e) => onKeyboardHandle(e, h)}
            />
          );
        })}
      {isLine &&
        (["p1", "p2"] as const).map((h) => (
          <div
            key={h}
            hidden={disabled}
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
        if (!isDocumentShortcut(e)) e.stopPropagation();
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
  const readOnly =
    useApp((state) => !!state.docs.find((doc) => doc.id === docId)?.readOnly) || note.locked;
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
              aria-label={`Cor ${c}`}
              disabled={readOnly}
              onClick={() => updateAnnot(docId, note.id, { color: c })}
            />
          ))}
        </div>
        <button
          type="button"
          className="icon-btn sm"
          title="Excluir comentário"
          disabled={readOnly}
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
        aria-label="Texto do comentário"
        readOnly={readOnly}
        onBlur={() => patchDoc(docId, { historyGroup: null })}
        placeholder="Escreva um comentário…"
        onChange={(e) => {
          setText(e.target.value);
          updateAnnot(docId, note.id, { text: e.target.value }, `note:${note.id}`);
        }}
        onKeyDown={(e) => {
          if (!isDocumentShortcut(e)) e.stopPropagation();
          if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) close();
        }}
      />
    </div>
  );
}
