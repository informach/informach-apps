import { viewSize } from "@shared/model";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { finishDraft, markupFromSelection } from "../lib/editing";
import { pageInfo } from "../lib/pdf";
import { type DocState, patchDoc, useApp } from "../state/store";
import { PageView } from "./PageView";
import { SearchBar } from "./SearchBar";

export const PT_TO_PX = 4 / 3;
const PAD = 28;
const GAP = 18;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 6;

export function Viewer({ doc }: { doc: DocState }): React.ReactElement {
  const tool = useApp((s) => s.tool);
  const stageRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef(new Map<string, HTMLElement>());
  const [viewport, setViewport] = useState({ top: 0, height: 800, width: 1000 });
  const scale = doc.zoom * PT_TO_PX;
  const pages = doc.content.pages;

  const sizes = useMemo(() => pages.map((p) => viewSize(p, pageInfo(p))), [pages]);
  const tops = useMemo(() => {
    const out: number[] = [];
    let y = PAD;
    for (const s of sizes) {
      out.push(y);
      y += s.h * scale + GAP;
    }
    out.push(y - GAP + PAD);
    return out;
  }, [sizes, scale]);

  const registerEl = useCallback((id: string, el: HTMLElement | null) => {
    if (el) pageEls.current.set(id, el);
    else pageEls.current.delete(id);
  }, []);

  // Track scroll position and size of the stage.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let raf = 0;
    const read = (): void => {
      raf = 0;
      setViewport({ top: el.scrollTop, height: el.clientHeight, width: el.clientWidth });
    };
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  // Current page: the last page whose top is above the upper third of the viewport.
  useEffect(() => {
    const probe = viewport.top + viewport.height * 0.3;
    let i = 0;
    while (i < pages.length - 1 && tops[i + 1] <= probe) i++;
    if (i !== doc.currentPage) patchDoc(doc.id, { currentPage: i });
  }, [viewport.top, viewport.height, tops, pages.length, doc.currentPage, doc.id]);

  // Fit modes follow window resizes.
  useEffect(() => {
    if (!doc.fit || !sizes.length) return;
    const maxW = Math.max(...sizes.map((s) => s.w));
    const cur = sizes[doc.currentPage] ?? sizes[0];
    const byWidth = (viewport.width - PAD * 2 - 4) / (maxW * PT_TO_PX);
    const byPage = Math.min(byWidth, (viewport.height - PAD * 2) / (cur.h * PT_TO_PX));
    const z = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, doc.fit === "width" ? Math.min(byWidth, 1.4) : byPage),
    );
    if (Math.abs(z - doc.zoom) > 0.001) patchDoc(doc.id, { zoom: z });
  }, [doc.fit, doc.currentPage, doc.zoom, doc.id, viewport.width, viewport.height, sizes]);

  // Keep the same spot of the document centred when the zoom changes.
  const prevScale = useRef(scale);
  useLayoutEffect(() => {
    const el = stageRef.current;
    const prev = prevScale.current;
    prevScale.current = scale;
    // At the very top (e.g. a freshly opened file) stay at the top instead of re-centring.
    if (!el || prev === scale || el.scrollTop === 0) return;
    const centre = el.scrollTop + el.clientHeight / 2;
    const k = scale / prev;
    el.scrollTop = Math.max(0, PAD + (centre - PAD) * k - el.clientHeight / 2);
    el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
  }, [scale]);

  // Explicit scroll requests (thumbnail clicks, search results, page input).
  const lastScrollRequest = useRef("");
  useEffect(() => {
    const req = doc.scrollRequest;
    const el = stageRef.current;
    if (!req || !el) return;
    const top = tops[req.page];
    if (top === undefined) return;
    const requestKey = `${doc.id}:${req.nonce}`;
    if (lastScrollRequest.current === requestKey) return;
    lastScrollRequest.current = requestKey;
    el.scrollTop = req.y !== undefined ? top + req.y * scale - el.clientHeight / 3 : top - 12;
  }, [doc.scrollRequest, doc.id, scale, tops]);

  // Ctrl + wheel zooms.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const d = useApp.getState().docs.find((x) => x.id === doc.id);
      if (!d) return;
      const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, d.zoom * 1.0015 ** -e.deltaY));
      patchDoc(doc.id, { zoom: z, fit: null });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [doc.id]);

  // Text markup tools act on the text selection when the mouse is released.
  useEffect(() => {
    if (tool !== "highlight" && tool !== "underline" && tool !== "strike") return;
    const onUp = (): void => {
      setTimeout(() => markupFromSelection(doc.id, tool, pageEls.current, scale), 0);
    };
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [tool, doc.id, scale]);

  const onPointerDownCapture = (e: React.PointerEvent): void => {
    const t = e.target as HTMLElement;
    if (doc.draft && !t.closest(".text-draft")) finishDraft(doc.id);
  };

  // Hand tool: drag to scroll.
  const onPointerDown = (e: React.PointerEvent): void => {
    if (tool !== "hand" || e.button !== 0) return;
    const el = stageRef.current!;
    const sx = e.clientX;
    const sy = e.clientY;
    const st = el.scrollTop;
    const sl = el.scrollLeft;
    el.classList.add("grabbing");
    const move = (ev: PointerEvent): void => {
      el.scrollTop = st - (ev.clientY - sy);
      el.scrollLeft = sl - (ev.clientX - sx);
    };
    const up = (): void => {
      el.classList.remove("grabbing");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const lo = viewport.top - viewport.height * 1.5;
  const hi = viewport.top + viewport.height * 2.5;
  const maxW = sizes.length ? Math.max(...sizes.map((s) => s.w)) * scale : 0;

  return (
    <div className="stage-wrap">
      <div
        ref={stageRef}
        className={`stage tool-${tool}`}
        onPointerDownCapture={onPointerDownCapture}
        onPointerDown={onPointerDown}
      >
        <div
          className="stage-pages"
          style={{ padding: `${PAD}px ${PAD}px`, gap: GAP, minWidth: maxW + PAD * 2 }}
        >
          {pages.map((p, i) => (
            <PageView
              key={p.id}
              doc={doc}
              page={p}
              index={i}
              scale={scale}
              visible={tops[i + 1] > lo && tops[i] < hi}
              registerEl={registerEl}
            />
          ))}
        </div>
      </div>
      {doc.search && <SearchBar doc={doc} />}
    </div>
  );
}

export function scrollToPage(docId: string, page: number, y?: number): void {
  patchDoc(docId, { scrollRequest: { page, y, nonce: Date.now() + Math.random() } });
}
