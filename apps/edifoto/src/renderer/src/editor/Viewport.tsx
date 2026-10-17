import type { Layer, RasterLayer, TextLayer, Transform, VectorLayer } from "@shared/doc";
import { docToLocal } from "@shared/vector";
import { Bot } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { getBitmap } from "@/engine/bitmaps";
import { compositor, toLayerMatrix } from "@/engine/compositor";
import { renderText } from "@/engine/text";
import { attempt } from "@/lib/actions";
import { isDocPath, openPath, placePaths } from "@/lib/files";
import { addLayer, setTransform } from "@/lib/ops";
import { beginStroke, continueStroke, endStroke } from "@/lib/paint";
import { requestRender, startRenderLoop } from "@/lib/render";
import { editVector } from "@/lib/vector";
import { fitView, panBy, setViewportSize, toDoc, toScreen, zoomStep, zoomTo } from "@/lib/view";
import { useDoc } from "@/state/doc";
import { type CropBox, useUi } from "@/state/ui";
import { useDrawingTools } from "./DrawingTools";
import { QuickDock } from "./QuickDock";

type Placed = RasterLayer | TextLayer | VectorLayer;

const isPlaced = (l: Layer | undefined): l is Placed =>
  !!l && (l.kind === "raster" || l.kind === "text" || l.kind === "vector");

function contentSize(l: Placed): [number, number] {
  if (l.kind === "vector") return [l.vector.width, l.vector.height];
  if (l.kind === "raster") return [l.width, l.height];
  const c = renderText(l.text).canvas;
  return [c.width, c.height];
}

/** Corners (TL, TR, BR, BL) of a placed layer, in document pixels. */
function corners(l: Placed): [number, number][] {
  const [w, h] = contentSize(l);
  const t = l.transform;
  const r = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([x, y]) => [t.x + (x * cos - y * sin) * t.scale, t.y + (x * sin + y * cos) * t.scale]);
}

/** Topmost visible image/text layer with a visible pixel under the point. */
function hitTest(x: number, y: number): string | null {
  const doc = useDoc.getState().doc;
  if (!doc) return null;
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i];
    if (!l.visible || !isPlaced(l)) continue;
    const [w, h] = contentSize(l);
    const m = toLayerMatrix(l.transform, w, h);
    const u = m[0] * x + m[3] * y + m[6];
    const v = m[1] * x + m[4] * y + m[7];
    if (u < 0 || v < 0 || u > 1 || v > 1) continue;
    if (l.kind === "text" || l.kind === "vector") return l.id;
    const b = getBitmap(l.bitmap);
    if (!b) continue;
    const a = b.ctx.getImageData(Math.floor(u * w), Math.floor(v * h), 1, 1).data[3];
    if (a > 10) return l.id;
  }
  return null;
}

type Drag =
  | { kind: "pan"; sx: number; sy: number }
  | { kind: "paint" }
  | { kind: "move"; id: string; sx: number; sy: number; t: Transform }
  | { kind: "resizeVector"; layer: VectorLayer; edge: number }
  | { kind: "scale"; id: string; t: Transform; d0: number }
  | { kind: "rotate"; id: string; t: Transform; a0: number }
  | { kind: "crop"; mode: string; start: CropBox; sx: number; sy: number };

const CURSORS: Record<string, string> = {
  pen: "crosshair",
  shape: "crosshair",
  select: "crosshair",
  lasso: "crosshair",
  wand: "crosshair",
  clone: "crosshair",
  blur: "crosshair",
  move: "default",
  crop: "crosshair",
  brush: "none",
  eraser: "none",
  text: "text",
  eyedropper: "crosshair",
  hand: "grab",
  zoom: "zoom-in",
};

function cropDrag(
  start: CropBox,
  mode: string,
  dx: number,
  dy: number,
  docW: number,
  docH: number,
): CropBox {
  let { x, y, w, h } = start;
  if (mode === "move") {
    x = Math.max(0, Math.min(docW - w, x + dx));
    y = Math.max(0, Math.min(docH - h, y + dy));
    return { ...start, x, y };
  }
  if (mode.includes("w")) {
    x += dx;
    w -= dx;
  }
  if (mode.includes("e")) w += dx;
  if (mode.includes("n")) {
    y += dy;
    h -= dy;
  }
  if (mode.includes("s")) h += dy;
  if (start.aspect) {
    const a = start.aspect;
    if (mode === "n" || mode === "s") {
      const nw = h * a;
      x -= (nw - w) / 2;
      w = nw;
    } else {
      const nh = w / a;
      if (mode.includes("n")) y -= nh - h;
      else if (!mode.includes("s")) y -= (nh - h) / 2;
      h = nh;
    }
  }
  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }
  return { ...start, x, y, w: Math.max(1, w), h: Math.max(1, h) };
}

export function Viewport(): ReactNode {
  const drawing = useDrawingTools();
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [mouse, setMouse] = useState<[number, number] | null>(null);
  const [dropping, setDropping] = useState(false);
  const [agentLive, setAgentLive] = useState(false);
  const tool = useUi((s) => s.tool);
  const view = useUi((s) => s.view);
  const brush = useUi((s) => (s.tool === "eraser" ? s.eraser : s.brush));
  const cropBox = useUi((s) => s.crop);
  const before = useUi((s) => s.beforeAfter);
  const fitRequest = useUi((s) => s.fitRequest);
  const externalAt = useUi((s) => s.externalAt);
  const doc = useDoc((s) => s.doc);
  const active = useDoc((s) => s.doc?.layers.find((l) => l.id === s.activeId));

  useEffect(() => {
    const el = host.current!;
    const c = compositor();
    el.prepend(c.canvas);
    let last = { w: el.clientWidth, h: el.clientHeight };
    const ro = new ResizeObserver(() => {
      // Opening/closing panels keeps the image where it was relative to the center.
      if (last.w && last.h) panBy((el.clientWidth - last.w) / 2, (el.clientHeight - last.h) / 2);
      last = { w: el.clientWidth, h: el.clientHeight };
      const dpr = window.devicePixelRatio || 1;
      c.canvas.width = Math.max(1, Math.round(el.clientWidth * dpr));
      c.canvas.height = Math.max(1, Math.round(el.clientHeight * dpr));
      setViewportSize(el.clientWidth, el.clientHeight);
      requestRender(false);
    });
    ro.observe(el);
    const stop = startRenderLoop();
    setViewportSize(el.clientWidth, el.clientHeight);
    fitView();
    requestRender();
    return () => {
      ro.disconnect();
      stop();
    };
  }, []);

  useEffect(() => {
    if (fitRequest) fitView();
  }, [fitRequest]);

  useEffect(() => {
    if (!externalAt) return;
    setAgentLive(true);
    const t = setTimeout(() => setAgentLive(false), 4000);
    return () => clearTimeout(t);
  }, [externalAt]);

  // Entering the crop tool starts with the whole image selected.
  useEffect(() => {
    if (tool === "crop" && !useUi.getState().crop && doc)
      useUi.setState({ crop: { x: 0, y: 0, w: doc.width, h: doc.height, aspect: null } });
  }, [tool, doc]);

  useEffect(() => {
    const el = host.current!;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      if (e.shiftKey) panBy(-e.deltaY, 0);
      else
        zoomTo(
          useUi.getState().view.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)),
          sx,
          sy,
        );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const local = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = host.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const startDrag = (d: Drag, e: React.PointerEvent): void => {
    drag.current = d;
    try {
      host.current!.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events (automated checks) have no capturable pointer */
    }
  };

  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button === 2) return;
    const [sx, sy] = local(e);
    const [x, y] = toDoc(sx, sy);
    const ui = useUi.getState();
    const ds = useDoc.getState();
    if (e.button === 1 || ui.tool === "hand") {
      startDrag({ kind: "pan", sx, sy }, e);
      return;
    }
    if (!ds.doc) return;
    if (drawing.down(e, { x, y })) return;
    if (ui.tool === "clone" && e.altKey) {
      useUi.setState({ cloneSource: { x, y } });
      ui.toast("Origem do carimbo definida.");
      return;
    }
    switch (ui.tool) {
      case "zoom":
        zoomStep(e.altKey ? -1 : 1, sx, sy);
        return;
      case "clone":
      case "blur":
      case "brush":
      case "eraser": {
        const err = beginStroke(x, y, ui.tool === "eraser");
        if (err) {
          ui.toast(err, "error");
          return;
        }
        startDrag({ kind: "paint" }, e);
        return;
      }
      case "eyedropper": {
        const c = compositor();
        const t = c.composite(ds.doc);
        const [r, g, b, a] = c.sample(t, x, y);
        requestRender();
        if (a <= 0) return;
        const hex = `#${[r, g, b]
          .map((v) =>
            Math.round(Math.min(1, Math.max(0, v)) * 255)
              .toString(16)
              .padStart(2, "0"),
          )
          .join("")}`;
        useUi.setState(e.altKey ? { bg: hex } : { fg: hex });
        return;
      }
      case "text": {
        const hit = hitTest(x, y);
        const hitLayer = hit ? ds.doc.layers.find((l) => l.id === hit) : undefined;
        if (hitLayer?.kind === "text") ds.setActive(hit);
        else
          attempt(() =>
            addLayer({
              kind: "text",
              textAt: { x, y },
              above: ds.doc!.layers[ds.doc!.layers.length - 1]?.id,
              text: { color: ui.fg },
            }),
          );
        useUi.setState((s) => ({ tab: "props", focusText: s.focusText + 1 }));
        return;
      }
      case "crop": {
        const box = ui.crop;
        if (box && x >= box.x && y >= box.y && x <= box.x + box.w && y <= box.y + box.h) {
          startDrag({ kind: "crop", mode: "move", start: box, sx: x, sy: y }, e);
          return;
        }
        const start = { x, y, w: 1, h: 1, aspect: box?.aspect ?? null };
        useUi.setState({ crop: start });
        startDrag({ kind: "crop", mode: "se", start, sx: x, sy: y }, e);
        return;
      }
      case "move": {
        let id = ds.activeId;
        if (ui.autoSelect || !isPlaced(ds.doc.layers.find((l) => l.id === id))) {
          const hit = hitTest(x, y);
          if (hit) {
            id = hit;
            ds.setActive(hit);
          }
        }
        const l = ds.doc.layers.find((x2) => x2.id === id);
        if (!isPlaced(l)) return;
        if (l.locked) {
          ui.toast(`A camada "${l.name}" está bloqueada.`);
          return;
        }
        startDrag({ kind: "move", id: l.id, sx: x, sy: y, t: l.transform }, e);
        return;
      }
    }
  };

  const onHandle = (kind: "scale" | "rotate", e: React.PointerEvent): void => {
    e.stopPropagation();
    const l = active;
    if (!isPlaced(l) || l.locked) return;
    const [x, y] = toDoc(...local(e));
    const t = l.transform;
    if (kind === "scale")
      startDrag({ kind: "scale", id: l.id, t, d0: Math.hypot(x - t.x, y - t.y) || 1 }, e);
    else startDrag({ kind: "rotate", id: l.id, t, a0: Math.atan2(y - t.y, x - t.x) }, e);
  };

  const onCropHandle = (mode: string, e: React.PointerEvent): void => {
    e.stopPropagation();
    const box = useUi.getState().crop;
    if (!box) return;
    const [x, y] = toDoc(...local(e));
    startDrag({ kind: "crop", mode, start: box, sx: x, sy: y }, e);
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    const [sx, sy] = local(e);
    setMouse([sx, sy]);
    if (drawing.move(e, { x: toDoc(sx, sy)[0], y: toDoc(sx, sy)[1] })) return;
    const d = drag.current;
    if (!d) return;
    const [x, y] = toDoc(sx, sy);
    switch (d.kind) {
      case "pan":
        panBy(sx - d.sx, sy - d.sy);
        d.sx = sx;
        d.sy = sy;
        return;
      case "paint": {
        const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? [];
        const events = coalesced.length ? coalesced : [e.nativeEvent];
        for (const ev of events) continueStroke(...toDoc(...local(ev)));
        return;
      }
      case "move":
        attempt(() =>
          setTransform(d.id, { x: d.t.x + (x - d.sx), y: d.t.y + (y - d.sy) }, `drag:${d.id}`),
        );
        return;
      case "resizeVector": {
        const l = d.layer,
          v = l.vector,
          t = l.transform,
          q = docToLocal({ x, y }, t, v.width, v.height);
        const width =
          d.edge === 1 || d.edge === 3 ? Math.max(1, 2 * Math.abs(q.x - v.width / 2)) : v.width;
        const height =
          d.edge === 0 || d.edge === 2 ? Math.max(1, 2 * Math.abs(q.y - v.height / 2)) : v.height;
        attempt(() => editVector(l.id, { width, height }, `resize:${l.id}`));
        return;
      }
      case "scale": {
        const s = (d.t.scale * Math.hypot(x - d.t.x, y - d.t.y)) / d.d0;
        attempt(() => setTransform(d.id, { scale: Math.max(0.01, s) }, `drag:${d.id}`));
        return;
      }
      case "rotate": {
        let r = d.t.rotation + ((Math.atan2(y - d.t.y, x - d.t.x) - d.a0) * 180) / Math.PI;
        if (e.shiftKey) r = Math.round(r / 15) * 15;
        attempt(() => setTransform(d.id, { rotation: Math.round(r * 10) / 10 }, `drag:${d.id}`));
        return;
      }
      case "crop": {
        const docNow = useDoc.getState().doc!;
        useUi.setState({
          crop: cropDrag(d.start, d.mode, x - d.sx, y - d.sy, docNow.width, docNow.height),
        });
        return;
      }
    }
  };

  const onPointerUp = (): void => {
    if (drawing.up()) return;
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "paint") endStroke();
  };

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    setDropping(false);
    const paths = [...e.dataTransfer.files].map((f) => window.api.pathForFile(f)).filter(Boolean);
    if (!paths.length) return;
    const docPath = paths.find(isDocPath);
    attempt(() => (docPath ? openPath(docPath) : placePaths(paths)));
  };

  // Overlay geometry
  const box =
    (tool === "move" || tool === "shape") && isPlaced(active) && !before
      ? corners(active).map(([x, y]) => toScreen(x, y))
      : null;
  const rotHandle = box
    ? (() => {
        const mx = (box[0][0] + box[1][0]) / 2;
        const my = (box[0][1] + box[1][1]) / 2;
        const cx = (box[0][0] + box[2][0]) / 2;
        const cy = (box[0][1] + box[2][1]) / 2;
        const len = Math.hypot(mx - cx, my - cy) || 1;
        return [mx + ((mx - cx) / len) * 24, my + ((my - cy) / len) * 24, mx, my];
      })()
    : null;
  const handles =
    box?.map((point, index) => ({
      id: ["top-left", "top-right", "bottom-right", "bottom-left"][index],
      point,
      index,
    })) ?? [];
  const crop =
    tool === "crop" && cropBox && doc
      ? {
          a: toScreen(cropBox.x, cropBox.y),
          b: toScreen(cropBox.x + cropBox.w, cropBox.y + cropBox.h),
        }
      : null;
  const cursorR =
    ["brush", "eraser", "clone", "blur"].includes(tool) && mouse ? (brush.size / 2) * view.zoom : 0;

  return (
    <div
      ref={host}
      className="viewport"
      role="application"
      aria-label="Área de edição. Use os painéis de propriedades para ajustar os objetos pelo teclado."
      style={{ cursor: drag.current?.kind === "pan" ? "grabbing" : CURSORS[tool] }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drawing.cancel();
        onPointerUp();
      }}
      onPointerLeave={() => setMouse(null)}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={(e) => {
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
    >
      <div className="overlay">
        <svg aria-label="Controles visuais de transformação">
          <title>Controles de transformação da imagem</title>
          {drawing.overlay}
          {box && (
            <>
              <polygon
                points={box.map((p) => p.join(",")).join(" ")}
                fill="none"
                stroke="#ff7a45"
                strokeWidth={1}
              />
              {rotHandle && (
                <line
                  x1={rotHandle[0]}
                  y1={rotHandle[1]}
                  x2={rotHandle[2]}
                  y2={rotHandle[3]}
                  stroke="#ff7a45"
                  strokeWidth={1}
                />
              )}
              {rotHandle && (
                <circle
                  className="handle"
                  cx={rotHandle[0]}
                  cy={rotHandle[1]}
                  r={5}
                  style={{ cursor: "grab" }}
                  onPointerDown={(e) => onHandle("rotate", e)}
                />
              )}
              {active?.kind === "vector" &&
                handles.map(({ id, point: [x, y], index: i }) => {
                  const next = box[(i + 1) % 4];
                  return (
                    <rect
                      key={`side-${id}`}
                      className="handle"
                      x={(x + next[0]) / 2 - 4}
                      y={(y + next[1]) / 2 - 4}
                      width={8}
                      height={8}
                      style={{ cursor: i % 2 ? "ew-resize" : "ns-resize" }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (!active.locked)
                          startDrag({ kind: "resizeVector", layer: active, edge: i }, e);
                      }}
                    />
                  );
                })}
              {handles.map(({ id, point: [x, y], index: i }) => (
                <rect
                  key={id}
                  className="handle"
                  x={x - 4}
                  y={y - 4}
                  width={8}
                  height={8}
                  style={{ cursor: i % 2 ? "nesw-resize" : "nwse-resize" }}
                  onPointerDown={(e) => onHandle("scale", e)}
                />
              ))}
            </>
          )}
          {crop && (
            <>
              <path
                d={`M-99999,-99999 H99999 V99999 H-99999 Z M${crop.a[0]},${crop.a[1]} V${crop.b[1]} H${crop.b[0]} V${crop.a[1]} Z`}
                fill="#000000a0"
                fillRule="evenodd"
              />
              <rect
                x={crop.a[0]}
                y={crop.a[1]}
                width={crop.b[0] - crop.a[0]}
                height={crop.b[1] - crop.a[1]}
                fill="none"
                stroke="#fff"
                strokeWidth={1}
              />
              {[1, 2].map((i) => (
                <g key={i} stroke="#ffffff55" strokeWidth={1}>
                  <line
                    x1={crop.a[0] + ((crop.b[0] - crop.a[0]) * i) / 3}
                    x2={crop.a[0] + ((crop.b[0] - crop.a[0]) * i) / 3}
                    y1={crop.a[1]}
                    y2={crop.b[1]}
                  />
                  <line
                    y1={crop.a[1] + ((crop.b[1] - crop.a[1]) * i) / 3}
                    y2={crop.a[1] + ((crop.b[1] - crop.a[1]) * i) / 3}
                    x1={crop.a[0]}
                    x2={crop.b[0]}
                  />
                </g>
              ))}
              {(
                [
                  ["nw", crop.a[0], crop.a[1]],
                  ["n", (crop.a[0] + crop.b[0]) / 2, crop.a[1]],
                  ["ne", crop.b[0], crop.a[1]],
                  ["e", crop.b[0], (crop.a[1] + crop.b[1]) / 2],
                  ["se", crop.b[0], crop.b[1]],
                  ["s", (crop.a[0] + crop.b[0]) / 2, crop.b[1]],
                  ["sw", crop.a[0], crop.b[1]],
                  ["w", crop.a[0], (crop.a[1] + crop.b[1]) / 2],
                ] as const
              ).map(([mode, x, y]) => (
                <rect
                  key={mode}
                  className="handle"
                  x={x - 5}
                  y={y - 5}
                  width={10}
                  height={10}
                  style={{ cursor: `${mode}-resize` }}
                  onPointerDown={(e) => onCropHandle(mode, e)}
                />
              ))}
            </>
          )}
          {cursorR > 0 && mouse && (
            <>
              <circle
                cx={mouse[0]}
                cy={mouse[1]}
                r={Math.max(1, cursorR)}
                fill="none"
                stroke="#000"
                strokeOpacity={0.6}
                strokeWidth={2}
              />
              <circle
                cx={mouse[0]}
                cy={mouse[1]}
                r={Math.max(1, cursorR)}
                fill="none"
                stroke="#fff"
                strokeWidth={1}
              />
              {cursorR < 4 && <circle cx={mouse[0]} cy={mouse[1]} r={1} fill="#fff" />}
            </>
          )}
        </svg>
      </div>
      {before && <div className="badge">Antes · só a camada de baixo</div>}
      {agentLive && (
        <div className="agent-badge">
          <Bot size={13} /> Agente externo editando…
        </div>
      )}
      {dropping && <div className="drop-hint">Solte para inserir como camada</div>}
      {tool !== "crop" && <QuickDock />}
    </div>
  );
}
