import {
  type GuideAxis,
  type GuideSet,
  NO_GUIDES,
  placeGuide,
  rulerStep,
  snapGuide,
} from "@shared/rulerGuides";
import type { ProjectSettings } from "@shared/types";
import { Eraser } from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useProject } from "@/state/project";

/** Thickness of the rulers, in screen pixels. */
export const RULER = 20;
/** Screen pixels within which a guide being dragged snaps to the frame and the pictures. */
const SNAP = 8;

type Frame = Pick<ProjectSettings, "width" | "height">;

/** A guide being dragged: a new one (index null) or one of the lesson's, at a share of the frame. */
export interface GuideDraft {
  axis: GuideAxis;
  index: number | null;
  value: number;
  /** Off the frame: letting go takes it away (or adds nothing). */
  out: boolean;
  snapped: boolean;
}

/** The lesson's guides (none when it has none). */
export function useGuides(): GuideSet {
  return useProject((s) => s.project?.guides) ?? NO_GUIDES;
}

/**
 * Dragging guides: from a ruler (a new one) or a guide itself. It follows the pointer over the
 * stage, snapping to `targets` (frame pixels: the frame's edges and center and the pictures on
 * screen; Alt lets it go anywhere), and letting go writes it to the lesson in one undo step; off
 * the frame, over the ruler, it is taken away.
 */
export function useGuideDrag({
  stageRef,
  frame,
  targets,
}: {
  stageRef: RefObject<HTMLDivElement | null>;
  frame: Frame;
  targets: () => { x: number[]; y: number[] };
}): {
  draft: GuideDraft | null;
  start: (e: React.PointerEvent, axis: GuideAxis, index: number | null) => void;
} {
  const [draft, setDraft] = useState<GuideDraft | null>(null);
  const start = useCallback(
    (e: React.PointerEvent, axis: GuideAxis, index: number | null): void => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const goals = targets()[axis];
      const size = axis === "x" ? frame.width : frame.height;
      let last: GuideDraft | null = null;
      const move = (ev: PointerEvent): void => {
        const rect = stageRef.current?.getBoundingClientRect();
        if (!rect) return;
        const length = axis === "x" ? rect.width : rect.height;
        const at = axis === "x" ? ev.clientX - rect.left : ev.clientY - rect.top;
        const px = (at / length) * size;
        const snapped = ev.altKey
          ? { value: px, target: null }
          : snapGuide(px, goals, (SNAP * size) / length);
        const value = Math.round(snapped.value) / size;
        last = {
          axis,
          index,
          value,
          out: at < 0 || at > length,
          snapped: snapped.target !== null,
        };
        setDraft(last);
      };
      const up = (): void => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        setDraft(null);
        const done = last;
        if (!done) return;
        // A new guide dropped off the frame is nothing; a guide of the lesson dropped there goes.
        if (done.out && index === null) return;
        const before = useProject.getState().project?.guides ?? NO_GUIDES;
        if (index !== null && !done.out && before[axis][index] === done.value) return;
        useProject.getState().commit((p) => {
          const next = placeGuide(
            p.guides ?? NO_GUIDES,
            axis,
            index,
            done.out ? null : done.value,
            size,
          );
          const { guides: _old, ...rest } = p;
          return next.x.length || next.y.length ? { ...rest, guides: next } : rest;
        });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [stageRef, frame.width, frame.height, targets],
  );
  return { draft, start };
}

/** Takes every guide away, in one undo step. */
export function clearGuides(): void {
  useProject.getState().commit((p) => {
    const { guides: _old, ...rest } = p;
    return rest;
  });
}

/** One ruler on a canvas: frame pixels from `origin` (screen pixels from its start) at `scale`. */
function RulerCanvas({
  axis,
  length,
  origin,
  scale,
  onPointerDown,
}: {
  axis: GuideAxis;
  length: number;
  origin: number;
  scale: number;
  onPointerDown: (e: React.PointerEvent) => void;
}): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null);
  const across = axis === "x";
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || length <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const w = across ? length : RULER;
    const h = across ? RULER : length;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // Drawn as EdiSVG draws its rulers (apps/edisvg/src/renderer/src/rulers.ts): the whole
    // length, a numbered tick across the ruler every `step` and four short ones between.
    const style = getComputedStyle(canvas);
    ctx.strokeStyle = style.color;
    ctx.fillStyle = style.color;
    ctx.font = `9px ${style.fontFamily}`;
    ctx.lineWidth = 1;
    const step = rulerStep(scale);
    const minor = step / 5;
    const first = -origin / scale;
    const last = (length - origin) / scale;
    ctx.beginPath();
    for (let index = Math.ceil(first / minor); index * minor <= last; index++) {
      const value = index * minor;
      const at = Math.round(origin + value * scale) + 0.5;
      const major = index % 5 === 0;
      const size = major ? RULER : RULER / 4;
      if (across) {
        ctx.moveTo(at, RULER);
        ctx.lineTo(at, RULER - size);
      } else {
        ctx.moveTo(RULER, at);
        ctx.lineTo(RULER - size, at);
      }
      if (!major) continue;
      const text = String(Math.round(value * 100) / 100);
      if (across) ctx.fillText(text, at + 3, 9);
      else {
        ctx.save();
        ctx.translate(9, at - 3);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }
    }
    ctx.stroke();
  }, [across, length, origin, scale]);
  return (
    <canvas
      ref={ref}
      className={`preview-ruler is-${across ? "top" : "left"}`}
      style={across ? { width: length, height: RULER } : { width: RULER, height: length }}
      title={
        across
          ? "Arraste para baixo para criar uma guia horizontal"
          : "Arraste para a direita para criar uma guia vertical"
      }
      onPointerDown={onPointerDown}
    />
  );
}

/**
 * The rulers along the top and the left of the preview area, counting frame pixels from the
 * frame's corner, following the preview's zoom and pan. Dragging from one makes a guide.
 */
export function Rulers({
  areaRef,
  stageRef,
  scale,
  guides,
  onStart,
}: {
  areaRef: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  scale: number;
  guides: GuideSet;
  onStart: (e: React.PointerEvent, axis: GuideAxis, index: number | null) => void;
}): ReactNode {
  const [box, setBox] = useState({ w: 0, h: 0, x: 0, y: 0 });
  // Where the frame is in the area, measured after every layout (zoom, pan, a new size).
  useLayoutEffect(() => {
    // The area is the stage's parent; its own ref is attached only after this runs, the first time.
    const areaEl = areaRef.current ?? stageRef.current?.parentElement;
    const area = areaEl?.getBoundingClientRect();
    const stage = stageRef.current?.getBoundingClientRect();
    if (!area || !stage) return;
    const next = {
      w: Math.round(area.width - RULER),
      h: Math.round(area.height - RULER),
      x: stage.left - area.left - RULER,
      y: stage.top - area.top - RULER,
    };
    setBox((b) =>
      b.w === next.w &&
      b.h === next.h &&
      Math.abs(b.x - next.x) < 0.5 &&
      Math.abs(b.y - next.y) < 0.5
        ? b
        : next,
    );
  });
  return (
    <>
      <button
        type="button"
        className="preview-ruler-corner"
        title="Tirar todas as guias"
        aria-label="Tirar todas as guias"
        disabled={!guides.x.length && !guides.y.length}
        onClick={clearGuides}
      >
        <Eraser size={11} />
      </button>
      <RulerCanvas
        axis="x"
        length={box.w}
        origin={box.x}
        scale={scale}
        // The top ruler makes horizontal guides (a height), the left one vertical ones.
        onPointerDown={(e) => onStart(e, "y", null)}
      />
      <RulerCanvas
        axis="y"
        length={box.h}
        origin={box.y}
        scale={scale}
        onPointerDown={(e) => onStart(e, "x", null)}
      />
    </>
  );
}

/**
 * The guides over the frame, inside the stage (they zoom and pan with it). Each one can be
 * dragged; the one being dragged shows where it is in frame pixels.
 */
export function StageGuides({
  guides,
  draft,
  width,
  height,
  frame,
  onStart,
}: {
  guides: GuideSet;
  draft: GuideDraft | null;
  width: number;
  height: number;
  frame: Frame;
  onStart: (e: React.PointerEvent, axis: GuideAxis, index: number | null) => void;
}): ReactNode {
  const line = (axis: GuideAxis, value: number, key: string, index: number | null): ReactNode => {
    const vertical = axis === "x";
    const dragging = draft?.axis === axis && draft.index === index;
    return (
      <span
        key={key}
        className={`user-guide ${vertical ? "is-v" : "is-h"} ${dragging ? "is-dragging" : ""}`}
        // On a whole pixel, so the line is sharp.
        style={vertical ? { left: Math.round(value * width) } : { top: Math.round(value * height) }}
        onPointerDown={index === null ? undefined : (e) => onStart(e, axis, index)}
        title="Arraste para mover a guia; solte fora do quadro para tirar"
      />
    );
  };
  return (
    <div className="user-guides">
      {(["x", "y"] as const).flatMap((axis) =>
        guides[axis].map((v, i) =>
          draft?.axis === axis && draft.index === i ? null : line(axis, v, `${axis}${i}`, i),
        ),
      )}
      {draft && !draft.out && (
        <>
          {line(draft.axis, draft.value, "draft", draft.index)}
          <span
            className={`user-guide-label ${draft.snapped ? "is-snapped" : ""}`}
            style={
              draft.axis === "x"
                ? { left: draft.value * width + 6, top: 6 }
                : { top: draft.value * height + 6, left: 6 }
            }
          >
            {draft.axis === "x" ? "x" : "y"} ={" "}
            {Math.round(draft.value * (draft.axis === "x" ? frame.width : frame.height))} px
          </span>
        </>
      )}
    </div>
  );
}
