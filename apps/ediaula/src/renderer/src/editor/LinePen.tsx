import { ANNOTATION_PRESETS, type Annotation, lineHeads } from "@shared/annotation";
import { lineFromDrag, MIN_DRAG_PX, type Point, snapEnd } from "@shared/lineGeometry";
import { inPalette } from "@shared/palettes";
import type { Project } from "@shared/types";
import { type ReactNode, useEffect, useEffectEvent, useRef, useState } from "react";
import { addAnnotation } from "@/lib/annotations";
import { activePalette } from "@/lib/palettes";
import { type LinePenRequest, useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { LineShape } from "./LineShape";

/**
 * The line tool: over the whole stage, a press is where the line starts and where it lets go is
 * where it ends (the tip of an arrow); Shift keeps it straight, diagonal or level. The line comes
 * out as one annotation at the playhead, one undo step, selected so its ends can be dragged
 * (editor/LineEndsControl.tsx). Esc gives up; nothing else hears the keys while it is open.
 */
export function LinePen({
  pen,
  width,
  height,
  settings,
}: {
  pen: LinePenRequest;
  width: number;
  height: number;
  settings: Project["settings"];
}): ReactNode {
  const [line, setLine] = useState<{ from: Point; to: Point } | null>(null);
  const press = useRef<{ from: Point; pointer: number } | null>(null);
  const stop = (): void => useApp.getState().set({ linePen: null });

  const onKey = useEffectEvent((e: KeyboardEvent): void => {
    if (e.key !== "Escape" || e.isComposing) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (press.current) {
      press.current = null;
      setLine(null);
    } else stop();
  });
  useEffect(() => {
    const key = (e: KeyboardEvent): void => onKey(e);
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);

  const preset = ANNOTATION_PRESETS.find((p) => p.kind === pen.kind)!.spec;
  const look = inPalette(
    { ...preset, ...pen.spec, kind: pen.kind } as Annotation,
    activePalette(useProject.getState().project),
  );
  /** Screen pixels per 1080p pixel of the frame. */
  const unit = (settings.height / 1080) * (width / settings.width);
  const thickness = (look.thickness ?? 14) * unit;
  const headSize = (look.headSize ?? (look.thickness ?? 14) * 3) * unit;

  /** Where the pointer is on the stage, in screen pixels inside it. */
  const at = (e: { clientX: number; clientY: number }, el: Element): Point => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(width, e.clientX - r.left)),
      y: Math.max(0, Math.min(height, e.clientY - r.top)),
    };
  };
  const down = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const from = at(e, e.currentTarget);
    press.current = { from, pointer: e.pointerId };
    setLine({ from, to: from });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent<HTMLDivElement>): void => {
    const p = press.current;
    if (!p || p.pointer !== e.pointerId) return;
    const to = at(e, e.currentTarget);
    setLine({ from: p.from, to: e.shiftKey ? snapEnd(p.from, to) : to });
  };
  const up = (e: React.PointerEvent<HTMLDivElement>): void => {
    const p = press.current;
    if (!p || p.pointer !== e.pointerId) return;
    press.current = null;
    const raw = at(e, e.currentTarget);
    const to = e.shiftKey ? snapEnd(p.from, raw) : raw;
    setLine(null);
    if (Math.hypot(to.x - p.from.x, to.y - p.from.y) < MIN_DRAG_PX) return;
    const drawn = lineFromDrag(
      { x: p.from.x / width, y: p.from.y / height },
      { x: to.x / width, y: to.y / height },
      settings,
    );
    stop();
    void addAnnotation(
      pen.kind,
      { ...pen.spec, angle: drawn.angle, length: drawn.length },
      { x: drawn.x, y: drawn.y },
    )
      .then(() => useApp.getState().set({ sideTab: "properties" }))
      .catch((error) => useApp.getState().toast(String(error), "error"));
  };

  return (
    <div
      className="line-pen"
      style={{ left: 0, top: 0, width, height }}
      role="application"
      aria-label={`${pen.label}: arraste do início ao fim`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        press.current = null;
        setLine(null);
      }}
    >
      <svg className="line-pen-lines" width={width} height={height} aria-hidden="true">
        {line && (
          <LineShape
            start={line.from}
            end={line.to}
            color={look.color}
            thickness={thickness}
            headSize={headSize}
            heads={lineHeads(look)}
          />
        )}
      </svg>
      <div className="polygon-pen-hint">
        <span className="polygon-pen-hint-text">
          {pen.label}: arraste do início ao fim
          {pen.kind === "arrow" ? " (a ponta fica onde você soltar)" : ""}. Shift deixa reta ou a
          45°. Esc cancela.
        </span>
      </div>
    </div>
  );
}
