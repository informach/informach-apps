import { withRenderKeys } from "@informach/edi-desktop/renderer";
import type { Anchor, Point, VectorLayer } from "@shared/doc";
import { docToLocal, dragRect, localToDoc, pathData, shapePath } from "@shared/vector";
import { type PointerEvent, type ReactNode, useRef, useState } from "react";
import { attempt } from "@/lib/actions";
import { setTransform } from "@/lib/ops";
import { selectPolygon, selectWand } from "@/lib/selection";
import { addVector, editVector, finishPen } from "@/lib/vector";
import { toScreen } from "@/lib/view";
import { useDoc } from "@/state/doc";
import { type SelectionMode, useUi } from "@/state/ui";

type DrawingDrag =
  | { kind: "shape" | "select" | "lasso"; start: Point; points: Point[]; mode: SelectionMode }
  | { kind: "pen"; index: number }
  | { kind: "anchor"; id: string | null; index: number; handle: "point" | "incoming" | "outgoing" };
export function useDrawingTools(): {
  down: (e: PointerEvent, p: Point) => boolean;
  move: (e: PointerEvent, p: Point) => boolean;
  up: () => boolean;
  cancel: () => void;
  overlay: ReactNode;
} {
  const drag = useRef<DrawingDrag | null>(null),
    [draft, setDraft] = useState<{ points: Point[]; shape?: ReturnType<typeof dragRect> } | null>(
      null,
    );
  const ui = useUi(),
    doc = useDoc((s) => s.doc),
    active = useDoc((s) => s.doc?.layers.find((l) => l.id === s.activeId));
  const capture = (e: PointerEvent): void => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* automated events */
    }
  };
  const down = (e: PointerEvent, p: Point): boolean => {
    if (e.button !== 0) return false;
    const mode: SelectionMode =
      e.shiftKey && e.altKey
        ? "intersect"
        : e.shiftKey
          ? "add"
          : e.altKey
            ? "subtract"
            : ui.selectionMode;
    if (ui.tool === "wand") {
      attempt(() => selectWand(p.x, p.y, mode));
      return true;
    }
    if (ui.tool === "pen") {
      const points = useUi.getState().penPoints;
      if (
        !e.ctrlKey &&
        points.length > 2 &&
        Math.hypot(p.x - points[0].x, p.y - points[0].y) * ui.view.zoom < 10
      ) {
        attempt(() => finishPen(true));
        return true;
      }
      if (e.ctrlKey) {
        const layer =
          !points.length && active?.kind === "vector" && active.vector.shape === "path"
            ? active
            : null;
        const list = layer ? layer.vector.points : points;
        const index = list.findIndex((a) => {
          const q = layer
            ? localToDoc(a, layer.transform, layer.vector.width, layer.vector.height)
            : a;
          return Math.hypot(q.x - p.x, q.y - p.y) * ui.view.zoom < 12;
        });
        if (index >= 0 && !layer?.locked) {
          useUi.setState({ penSelected: index });
          drag.current = { kind: "anchor", id: layer?.id ?? null, index, handle: "point" };
          capture(e);
        }
        return true;
      }
      useUi.setState({ penPoints: [...points, { ...p }], penSelected: null });
      drag.current = { kind: "pen", index: points.length };
      capture(e);
      return true;
    }
    if (ui.tool === "shape" || ui.tool === "select" || ui.tool === "lasso") {
      drag.current = { kind: ui.tool, start: p, points: [p], mode };
      setDraft({ points: [p] });
      capture(e);
      return true;
    }
    return false;
  };
  const move = (e: PointerEvent, p: Point): boolean => {
    const d = drag.current;
    if (!d) return false;
    if (d.kind === "pen") {
      const points = useUi.getState().penPoints,
        a = points[d.index];
      if (!a) return true;
      if (Math.hypot(p.x - a.x, p.y - a.y) * ui.view.zoom > 3)
        useUi.setState({
          penPoints: points.map((v, i) =>
            i === d.index
              ? {
                  ...a,
                  smooth: true,
                  incoming: { x: 2 * a.x - p.x, y: 2 * a.y - p.y },
                  outgoing: p,
                }
              : v,
          ),
        });
    } else if (d.kind === "anchor") {
      const l = d.id ? useDoc.getState().doc?.layers.find((l) => l.id === d.id) : null;
      if (d.id && (l?.kind !== "vector" || l.locked)) return true;
      const layer = l?.kind === "vector" ? l : null;
      const points = layer ? layer.vector.points : useUi.getState().penPoints;
      const q = layer ? docToLocal(p, layer.transform, layer.vector.width, layer.vector.height) : p;
      const a = points[d.index];
      if (!a) return true;
      let next: Anchor;
      if (d.handle === "point") {
        const dx = q.x - a.x,
          dy = q.y - a.y;
        const shift = (c: Point): Point => ({ x: c.x + dx, y: c.y + dy });
        next = {
          ...a,
          ...q,
          incoming: a.incoming && shift(a.incoming),
          outgoing: a.outgoing && shift(a.outgoing),
        };
      } else {
        next = { ...a, [d.handle]: q };
        if (a.smooth && !e.altKey)
          next[d.handle === "incoming" ? "outgoing" : "incoming"] = {
            x: 2 * a.x - q.x,
            y: 2 * a.y - q.y,
          };
        if (e.altKey) next.smooth = false;
      }
      const updated = points.map((a, i) => (i === d.index ? next : a));
      if (layer)
        attempt(() => editVector(layer.id, { points: updated }, `point:${layer.id}:${d.index}`));
      else useUi.setState({ penPoints: updated });
    } else if (d.kind === "lasso") {
      d.points.push(p);
      setDraft({ points: [...d.points] });
    } else {
      const rect = dragRect(
        d.start,
        p,
        d.kind === "shape" && e.shiftKey,
        d.kind === "shape" && e.altKey,
      );
      setDraft({ points: [d.start, p], shape: rect });
    }
    return true;
  };
  const up = (): boolean => {
    const d = drag.current;
    if (!d) return false;
    drag.current = null;
    if (d.kind === "shape" && draft?.shape) {
      const r = draft.shape;
      attempt(() => {
        const id = addVector(
          {
            ...useUi.getState().vector,
            shape: ui.vector.shape === "path" ? "rectangle" : ui.vector.shape,
            width: r.width,
            height: r.height,
            closed: ui.vector.shape !== "line",
            points: [],
          },
          { x: r.x, y: r.y },
        );
        const end = draft.points[1];
        if (ui.vector.shape === "line" && end && (end.x - d.start.x) * (end.y - d.start.y) < 0)
          setTransform(id, { flipY: true });
      });
    }
    if (d.kind === "select" && draft?.shape) {
      const r = draft.shape,
        x = r.x - r.width / 2,
        y = r.y - r.height / 2;
      attempt(() =>
        selectPolygon(
          [
            { x, y },
            { x: x + r.width, y },
            { x: x + r.width, y: y + r.height },
            { x, y: y + r.height },
          ],
          d.mode,
        ),
      );
    }
    if (d.kind === "lasso") attempt(() => selectPolygon(d.points, d.mode));
    setDraft(null);
    return true;
  };
  const anchorDown = (
    e: PointerEvent,
    id: string | null,
    index: number,
    handle: "point" | "incoming" | "outgoing",
  ): void => {
    e.stopPropagation();
    const l = useDoc.getState().doc?.layers.find((l) => l.id === id);
    if (l?.locked) return;
    useUi.setState({ penSelected: index });
    drag.current = { kind: "anchor", id, index, handle };
    capture(e);
  };
  const screen = (p: Point): Point => {
    const [x, y] = toScreen(p.x, p.y);
    return { x, y };
  };
  const mapAnchor = (a: Anchor, layer?: VectorLayer): Anchor => {
    const map = (p: Point): Point =>
      screen(layer ? localToDoc(p, layer.transform, layer.vector.width, layer.vector.height) : p);
    return {
      ...map(a),
      incoming: a.incoming && map(a.incoming),
      outgoing: a.outgoing && map(a.outgoing),
    };
  };
  const editing =
    ui.tool === "pen" &&
    active?.kind === "vector" &&
    active.vector.shape === "path" &&
    !ui.penPoints.length
      ? active
      : null;
  const anchors = (editing ? editing.vector.points : ui.penPoints).map((a) =>
    mapAnchor(a, editing ?? undefined),
  );
  const rect = draft?.shape,
    a = rect ? screen({ x: rect.x - rect.width / 2, y: rect.y - rect.height / 2 }) : null;
  const origin = screen({ x: 0, y: 0 });
  const overlay = (
    <>
      {ui.selectionPreview && doc && (
        <image
          href={ui.selectionPreview}
          x={origin.x}
          y={origin.y}
          width={doc.width * ui.view.zoom}
          height={doc.height * ui.view.zoom}
        />
      )}
      {rect && a && (
        <g transform={`translate(${a.x} ${a.y}) scale(${ui.view.zoom})`}>
          <path
            d={shapePath({
              ...ui.vector,
              width: rect.width,
              height: rect.height,
              shape: ui.tool === "select" ? "rectangle" : ui.vector.shape,
              radius: ui.tool === "select" ? 0 : ui.vector.radius,
            })}
            fill={ui.tool === "select" ? "#ff7a4522" : (ui.vector.fillColor ?? "none")}
            fillOpacity={0.6}
            stroke="#ff7a45"
            strokeWidth={1 / ui.view.zoom}
          />
        </g>
      )}
      {draft && !rect && (
        <polyline
          points={draft.points
            .map((p) => {
              const q = screen(p);
              return `${q.x},${q.y}`;
            })
            .join(" ")}
          fill="none"
          stroke="#ff7a45"
        />
      )}
      {anchors.length > 0 && (
        <>
          <path
            d={pathData(anchors, editing?.vector.closed ?? false)}
            fill="none"
            stroke="#ff7a45"
            strokeWidth={1.5}
          />
          {withRenderKeys(anchors, (point) => JSON.stringify(point)).map(({ key, value: p }, i) => (
            <g key={key}>
              {(["incoming", "outgoing"] as const).map(
                (h) =>
                  p[h] && (
                    <g key={h}>
                      <line x1={p.x} y1={p.y} x2={p[h]!.x} y2={p[h]!.y} stroke="#ffffff" />
                      <circle
                        className="handle"
                        cx={p[h]!.x}
                        cy={p[h]!.y}
                        r={4}
                        onPointerDown={(e) => anchorDown(e, editing?.id ?? null, i, h)}
                      />
                    </g>
                  ),
              )}
              <rect
                className="handle"
                x={p.x - 4}
                y={p.y - 4}
                width={8}
                height={8}
                onPointerDown={(e) => {
                  if (editing) anchorDown(e, editing.id, i, "point");
                  else if (i === 0 && anchors.length > 2 && !e.ctrlKey) {
                    e.stopPropagation();
                    attempt(() => finishPen(true));
                  } else anchorDown(e, null, i, "point");
                }}
              />
            </g>
          ))}
        </>
      )}
    </>
  );
  return {
    down,
    move,
    up,
    cancel: () => {
      drag.current = null;
      setDraft(null);
    },
    overlay,
  };
}
