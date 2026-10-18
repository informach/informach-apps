import { viewSize } from "@shared/model";
import { pageLayoutGeometry, visiblePageRows } from "@shared/page-layout";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { finishDraft, markupFromSelection } from "../lib/editing";
import { pageInfo } from "../lib/pdf";
import {
  recordNavigation,
  rememberViewPosition,
  scrollNonce,
  viewPosition,
} from "../lib/workspace-view";
import { type DocState, patchDoc, useApp } from "../state/store";
import { PageView } from "./PageView";
import { SearchBar } from "./SearchBar";

export const PT_TO_PX = 4 / 3;
const PAD = 28,
  GAP = 18;
export const MIN_ZOOM = 0.1,
  MAX_ZOOM = 6;

export function Viewer({ doc }: { doc: DocState }): React.ReactElement {
  const tool = useApp((state) => state.tool);
  const stageRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef(new Map<string, HTMLElement>());
  const [viewport, setViewport] = useState({ top: 0, height: 0, width: 0 });
  const scale = doc.zoom * PT_TO_PX,
    pages = doc.content.pages;
  const mode = doc.pageLayout ?? "continuous",
    singlePage = mode === "single" ? doc.currentPage : 0;
  const sizes = useMemo(() => pages.map((page) => viewSize(page, pageInfo(page))), [pages]);
  const geometry = useMemo(
    () => pageLayoutGeometry(sizes, scale, mode, singlePage, PAD, GAP),
    [sizes, scale, mode, singlePage],
  );
  const fittedZoom = (() => {
    if (!doc.fit || !geometry.rows.length || viewport.width <= 0 || viewport.height <= 0)
      return null;
    const contentWidth = (geometry.width - PAD * 2 - (mode === "spread" ? GAP : 0)) / scale;
    const current = sizes[doc.currentPage] ?? sizes[0];
    const byWidth =
      (viewport.width - PAD * 2 - (mode === "spread" ? GAP : 0) - 4) / (contentWidth * PT_TO_PX);
    const byPage = Math.min(byWidth, (viewport.height - PAD * 2) / (current.h * PT_TO_PX));
    return Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, doc.fit === "width" ? Math.min(byWidth, 1.4) : byPage),
    );
  })();
  const fitting = !!doc.fit && (fittedZoom === null || Math.abs(fittedZoom - doc.zoom) > 0.001);
  const layout = useRef({ geometry, pages, scale, currentPage: doc.currentPage });
  useLayoutEffect(() => {
    layout.current = { geometry, pages, scale, currentPage: doc.currentPage };
  }, [geometry, pages, scale, doc.currentPage]);
  const registerEl = useCallback((id: string, el: HTMLElement | null) => {
    if (el) pageEls.current.set(id, el);
    else pageEls.current.delete(id);
  }, []);
  const capturePosition = useCallback(
    (el: HTMLElement) => {
      if (!useApp.getState().docs.some((item) => item.id === doc.id)) return;
      const current = layout.current;
      const row =
        visiblePageRows(current.geometry.rows, el.scrollTop, el.scrollTop + 1)[0] ??
        visiblePageRows(current.geometry.rows, el.scrollTop + GAP, el.scrollTop + GAP + 1)[0];
      const index = row?.indices[0] ?? 0,
        page = current.pages[index];
      if (page)
        rememberViewPosition(doc.id, {
          page: page.id,
          offset: (el.scrollTop - current.geometry.tops[index]) / current.scale,
          left: el.scrollLeft / current.scale,
        });
    },
    [doc.id],
  );

  // Workspace positions live outside React: scrolling does not rerender every document consumer.
  useLayoutEffect(() => {
    const el = stageRef.current,
      position = viewPosition(doc.id);
    if (!el) return;
    const current = layout.current;
    const index =
      mode === "single"
        ? current.currentPage
        : position
          ? current.pages.findIndex((page) => page.id === position.page)
          : current.currentPage;
    el.scrollTop = Math.max(
      0,
      (current.geometry.tops[Math.max(0, index)] ?? PAD) + (position?.offset ?? 0) * current.scale,
    );
    el.scrollLeft = (position?.left ?? 0) * current.scale;
    setViewport({ top: el.scrollTop, width: el.clientWidth, height: el.clientHeight });
  }, [doc.id, mode]);
  useLayoutEffect(() => {
    const el = stageRef.current;
    return () => {
      if (el) capturePosition(el);
    };
  }, [capturePosition]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      setViewport({ top: el.scrollTop, height: el.clientHeight, width: el.clientWidth });
      capturePosition(el);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    el.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", schedule);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [capturePosition]);

  useEffect(() => {
    if (mode === "single" || viewport.height <= 0 || fitting || doc.scrollRequest) return;
    const el = stageRef.current;
    if (
      !el ||
      el.scrollTop !== viewport.top ||
      el.clientWidth !== viewport.width ||
      el.clientHeight !== viewport.height
    )
      return;
    const probe = el.scrollTop + el.clientHeight * 0.3;
    const row = visiblePageRows(geometry.rows, probe, probe + GAP + 1)[0];
    if (row && !row.indices.includes(doc.currentPage))
      patchDoc(doc.id, { currentPage: row.indices[0] });
  }, [
    viewport.top,
    viewport.width,
    viewport.height,
    geometry,
    mode,
    doc.id,
    doc.currentPage,
    fitting,
    doc.scrollRequest,
  ]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    if (el.clientWidth !== viewport.width || el.clientHeight !== viewport.height) {
      setViewport({ top: el.scrollTop, height: el.clientHeight, width: el.clientWidth });
      return;
    }
    if (fittedZoom !== null && Math.abs(fittedZoom - doc.zoom) > 0.001)
      patchDoc(doc.id, { zoom: fittedZoom });
  }, [fittedZoom, doc.zoom, doc.id, viewport.width, viewport.height]);

  const previousScale = useRef(scale);
  useLayoutEffect(() => {
    const el = stageRef.current,
      previous = previousScale.current;
    previousScale.current = scale;
    if (!el || previous === scale || el.scrollTop === 0 || doc.scrollRequest) return;
    const centre = el.scrollTop + el.clientHeight / 2;
    el.scrollTop = Math.max(0, PAD + ((centre - PAD) * scale) / previous - el.clientHeight / 2);
    el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
    setViewport({ top: el.scrollTop, height: el.clientHeight, width: el.clientWidth });
  }, [scale, doc.scrollRequest]);

  useLayoutEffect(() => {
    const request = doc.scrollRequest,
      el = stageRef.current;
    if (!request || !el) return;
    if (el.clientWidth !== viewport.width || el.clientHeight !== viewport.height) {
      setViewport({ top: el.scrollTop, height: el.clientHeight, width: el.clientWidth });
      return;
    }
    if (fitting || viewport.width <= 0 || viewport.height <= 0) return;
    const top = geometry.tops[request.page];
    if (top === undefined) {
      patchDoc(doc.id, { scrollRequest: null });
      return;
    }
    el.scrollTop =
      request.offset !== undefined
        ? top + request.offset * scale
        : request.y !== undefined
          ? top + request.y * scale - el.clientHeight / 3
          : top - 12;
    if (request.left !== undefined) el.scrollLeft = request.left * scale;
    setViewport({ top: el.scrollTop, height: el.clientHeight, width: el.clientWidth });
    patchDoc(doc.id, { scrollRequest: null });
  }, [doc.scrollRequest, doc.id, geometry, scale, fitting, viewport.width, viewport.height]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const current = useApp.getState().docs.find((item) => item.id === doc.id);
      if (current)
        patchDoc(doc.id, {
          zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current.zoom * 1.0015 ** -event.deltaY)),
          fit: null,
        });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [doc.id]);

  useEffect(() => {
    if (tool !== "highlight" && tool !== "underline" && tool !== "strike") return;
    const release = () => markupFromSelection(doc.id, tool, pageEls.current, scale);
    window.addEventListener("pointerup", release);
    return () => window.removeEventListener("pointerup", release);
  }, [tool, doc.id, scale]);

  const pointerDown = (event: React.PointerEvent) => {
    if (tool !== "hand" || event.button !== 0) return;
    const el = stageRef.current;
    if (!el) return;
    const x = event.clientX,
      y = event.clientY,
      top = el.scrollTop,
      left = el.scrollLeft;
    el.classList.add("grabbing");
    el.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent) => {
      el.scrollTop = top - (ev.clientY - y);
      el.scrollLeft = left - (ev.clientX - x);
    };
    const end = () => {
      el.classList.remove("grabbing");
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end, { once: true });
    el.addEventListener("pointercancel", end, { once: true });
  };
  const visible = visiblePageRows(
    geometry.rows,
    viewport.top - viewport.height * 1.5,
    viewport.top + viewport.height * 2.5,
  );
  return (
    <div className="stage-wrap">
      <div
        ref={stageRef}
        className={`stage tool-${tool}`}
        onPointerDownCapture={(event) => {
          if (doc.draft && event.target instanceof Element && !event.target.closest(".text-draft"))
            finishDraft(doc.id);
        }}
        onPointerDown={pointerDown}
      >
        <div
          className="stage-pages virtual-pages"
          style={{ height: geometry.height, minWidth: geometry.width }}
        >
          {visible.map((row) => (
            <div
              key={pages[row.indices[0]].id}
              className="viewer-row"
              style={{ top: row.top, width: row.width, height: row.height, gap: GAP }}
            >
              {row.indices.map((index) => (
                <PageView
                  key={pages[index].id}
                  doc={doc}
                  page={pages[index]}
                  index={index}
                  scale={scale}
                  visible
                  registerEl={registerEl}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {doc.search && <SearchBar doc={doc} />}
    </div>
  );
}

export function scrollToPage(docId: string, page: number, y?: number): void {
  const document = useApp.getState().docs.find((doc) => doc.id === docId);
  if (!document || page < 0 || page >= document.content.pages.length) return;
  recordNavigation(docId);
  patchDoc(docId, {
    currentPage: page,
    scrollRequest: { page, y, nonce: scrollNonce() },
    navigationRevision: (document.navigationRevision ?? 0) + 1,
  });
}
