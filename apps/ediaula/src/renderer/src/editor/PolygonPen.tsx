import { POLYGON_MAX, POLYGON_SHAPES_MAX, type Polygon, type PolygonPoint } from "@shared/compose";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

/** Screen pixels around the first corner where a click closes the outline. */
const CLOSE_PX = 10;
/** A click this close to the last corner adds none (the second click of a double click). */
const SAME_PX = 4;
/** A press that moves this far draws a rectangle instead of placing a corner. */
const DRAG_PX = 6;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * The pen: draws one or more shapes over an area of `width` × `height` screen pixels, turned by
 * `angle` degrees around its center when the layer it is drawn on turns.
 *
 * - Dragging draws a rectangle.
 * - Each click places a corner of a free shape; a click on its first corner closes it.
 * - Enter, a double click or "Concluir" ends, with every shape closed so far (a free shape with
 *   three corners or more is closed on the way). Backspace takes the last corner back, or the
 *   last shape; Esc cancels everything.
 *
 * It starts with the shapes already drawn (`initial`), so opening it again adds to them.
 *
 * The keys go to the pen only while it is open (nothing else hears Backspace, which would delete
 * the selected clip). The shapes come back as outlines of fractions of the area.
 */
export function PolygonPen({
  width,
  height,
  angle = 0,
  style,
  shade = false,
  label,
  initial,
  onFinish,
  onCancel,
}: {
  width: number;
  height: number;
  angle?: number;
  style?: CSSProperties;
  /** Darkens everything around the area (the picture drawn on, among the others). */
  shade?: boolean;
  label: string;
  /**
   * The shapes already there (fractions of the area): the pen starts with them, so drawing again
   * adds to them; Backspace takes them back one by one.
   */
  initial?: Polygon;
  onFinish: (polygon: Polygon) => void;
  onCancel: () => void;
}): ReactNode {
  /** Shapes already closed. */
  const [shapes, setShapes] = useState<Polygon>(() => initial?.map((s) => [...s]) ?? []);
  /** Corners of the free shape being drawn. */
  const [drawn, setDrawn] = useState<PolygonPoint[]>([]);
  const [hover, setHover] = useState<PolygonPoint | null>(null);
  /** The rectangle being dragged, from where the press started. */
  const [box, setBox] = useState<{ from: PolygonPoint; to: PolygonPoint } | null>(null);
  const press = useRef<{ at: PolygonPoint; pointer: number } | null>(null);
  const corners = shapes.reduce((n, s) => n + s.length, 0) + drawn.length;
  const full = shapes.length >= POLYGON_SHAPES_MAX;

  const finish = (): void => {
    const all = drawn.length >= 3 ? [...shapes, drawn] : shapes;
    if (!all.length) return;
    setShapes([]);
    setDrawn([]);
    setHover(null);
    onFinish(all);
  };
  const close = (): void => {
    if (drawn.length < 3) return;
    setShapes((s) => [...s, drawn]);
    setDrawn([]);
  };
  const undo = (): void => {
    if (drawn.length) setDrawn((d) => d.slice(0, -1));
    else setShapes((s) => s.slice(0, -1));
  };
  const onKey = useEffectEvent((e: KeyboardEvent): void => {
    if (e.isComposing) return;
    const take = (): void => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    if (e.key === "Escape") {
      take();
      onCancel();
    } else if (e.key === "Enter") {
      take();
      finish();
    } else if (e.key === "Backspace" || e.key === "Delete") {
      take();
      undo();
    }
  });
  useEffect(() => {
    const key = (e: KeyboardEvent): void => onKey(e);
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);

  const turn = (angle * Math.PI) / 180;
  /** Where the pointer is on the area (fractions), the area turned or not. */
  const at = (e: { clientX: number; clientY: number }, el: Element): PolygonPoint => {
    const r = el.getBoundingClientRect();
    const sx = e.clientX - (r.left + r.width / 2);
    const sy = e.clientY - (r.top + r.height / 2);
    const lx = sx * Math.cos(turn) + sy * Math.sin(turn);
    const ly = -sx * Math.sin(turn) + sy * Math.cos(turn);
    return [clamp01(lx / width + 0.5), clamp01(ly / height + 0.5)];
  };
  const apart = (p: PolygonPoint, q: PolygonPoint): number =>
    Math.hypot((p[0] - q[0]) * width, (p[1] - q[1]) * height);

  /** A click: a corner of the free shape, or its first corner again to close it. */
  const click = (p: PolygonPoint): void => {
    const first = drawn[0];
    if (first && drawn.length >= 3 && apart(p, first) <= CLOSE_PX) {
      close();
      return;
    }
    const last = drawn.at(-1);
    if ((last && apart(p, last) < SAME_PX) || corners >= POLYGON_MAX || full) return;
    setDrawn([...drawn, p]);
  };
  const down = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    press.current = { at: at(e, e.currentTarget), pointer: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent<HTMLDivElement>): void => {
    const p = at(e, e.currentTarget);
    setHover(p);
    const from = press.current;
    // A rectangle starts only between free shapes, so a click that wobbles still places a corner.
    if (from && from.pointer === e.pointerId && !drawn.length && apart(p, from.at) >= DRAG_PX)
      setBox({ from: from.at, to: p });
  };
  const up = (e: React.PointerEvent<HTMLDivElement>): void => {
    const from = press.current;
    if (!from || from.pointer !== e.pointerId) return;
    press.current = null;
    const p = at(e, e.currentTarget);
    if (box) {
      setBox(null);
      const [x0, x1] = [Math.min(from.at[0], p[0]), Math.max(from.at[0], p[0])];
      const [y0, y1] = [Math.min(from.at[1], p[1]), Math.max(from.at[1], p[1])];
      if ((x1 - x0) * width < SAME_PX || (y1 - y0) * height < SAME_PX) return;
      if (full || corners + 4 > POLYGON_MAX) return;
      setShapes((s) => [
        ...s,
        [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ],
      ]);
      return;
    }
    click(p);
  };

  const xy = ([x, y]: PolygonPoint): string => `${x * width},${y * height}`;
  const closing = drawn.length >= 3;
  const ready = shapes.length > 0 || closing;
  const rect: PolygonPoint[] | null = box
    ? [box.from, [box.to[0], box.from[1]], box.to, [box.from[0], box.to[1]]]
    : null;
  return (
    <div
      className={`polygon-pen${shade ? " is-shaded" : ""}`}
      style={{ ...style, width, height }}
      role="application"
      aria-label={label}
      title={`Arraste para um retângulo, ou clique para cada canto de uma forma livre (até ${POLYGON_MAX} cantos e ${POLYGON_SHAPES_MAX} formas). Enter, dois cliques ou Concluir terminam; Backspace desfaz e Esc cancela.`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        press.current = null;
        setBox(null);
      }}
      onPointerLeave={() => setHover(null)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        finish();
      }}
    >
      <svg className="polygon-pen-lines" width={width} height={height} aria-hidden="true">
        {shapes.map((s, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: shapes are only added or taken from the end
          <polygon key={i} className="polygon-pen-shape" points={s.map(xy).join(" ")} />
        ))}
        {rect && (
          <polygon className="polygon-pen-shape is-drawing" points={rect.map(xy).join(" ")} />
        )}
        {drawn.length > 1 && (
          <polyline className="polygon-pen-line" points={drawn.map(xy).join(" ")} />
        )}
        {hover && drawn.length > 0 && (
          <polyline
            className="polygon-pen-next"
            points={[drawn[drawn.length - 1], hover, ...(drawn.length >= 2 ? [drawn[0]] : [])]
              .map(xy)
              .join(" ")}
          />
        )}
        {drawn.map((p, i) => (
          <circle
            // biome-ignore lint/suspicious/noArrayIndexKey: corners are only added or taken from the end
            key={i}
            className={i === 0 && closing ? "polygon-pen-corner is-first" : "polygon-pen-corner"}
            cx={p[0] * width}
            cy={p[1] * height}
            r={i === 0 && closing ? 7 : 5}
          />
        ))}
      </svg>
      <div className="polygon-pen-hint">
        <span className="polygon-pen-hint-text">
          {drawn.length
            ? closing
              ? "Clique no primeiro ponto para fechar esta forma."
              : `Clique para pôr os cantos (${drawn.length} de pelo menos 3).`
            : shapes.length
              ? `${shapes.length} ${shapes.length === 1 ? "forma" : "formas"}. Arraste para mais um retângulo ou clique para outra forma; Backspace apaga a última.`
              : "Arraste para um retângulo, ou clique para cada canto de uma forma livre."}{" "}
          Esc cancela.
        </span>
        {ready && (
          <button
            type="button"
            className="polygon-pen-done"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              finish();
            }}
          >
            Concluir (Enter)
          </button>
        )}
      </div>
    </div>
  );
}
