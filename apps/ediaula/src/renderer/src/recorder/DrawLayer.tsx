import {
  BOARD_COLORS,
  BOARD_INK,
  type BoardKind,
  colorName,
  DRAWING_WIDTH_NAMES,
  DRAWING_WIDTHS,
  type DrawingTool,
  MAX_STROKE_POINTS,
  type VisibleStroke,
} from "@shared/drawing";
import { clockOffset } from "@shared/overNarration";
import { ArrowUpRight, Eraser, Highlighter, PenLine, X } from "lucide-react";
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { paintBoard, paintStrokes } from "@/lib/drawingPaint";
import { useUiRect } from "./uiRects";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * While drawing is on, the recorder window takes the mouse: leaving the toolbar must not hand the
 * clicks back to the apps underneath (RecorderOverlay's controls read this).
 */
export const drawing = { on: false };

/** Colors offered when the lesson has no palette (EdiAula's). */
const FALLBACK = ["#C8F031", "#FF4D4D", "#FFD60A", "#3D6BFF", "#FFFFFF", "#12140A"];

const TOOLS: { id: DrawingTool; label: string; icon: typeof PenLine }[] = [
  { id: "pen", label: "Caneta", icon: PenLine },
  { id: "marker", label: "Marca-texto", icon: Highlighter },
  { id: "arrow", label: "Seta", icon: ArrowUpRight },
];

/** The window's clock against the main process's (QPC ms), by a few round trips. */
async function measureOffset(): Promise<number> {
  const samples: { sent: number; got: number; qpc: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const sent = performance.now();
    const qpc = await window.api.recorder.clock();
    samples.push({ sent, got: performance.now(), qpc });
  }
  return clockOffset(samples);
}

interface LiveStroke {
  /** performance.now() of the first point. */
  start: number;
  color: string;
  width: number;
  tool: DrawingTool;
  /** x, y (fractions of the region) and ms after `start`. */
  points: [number, number, number][];
}

/**
 * Drawing on the screen during a take: a canvas over the recorder window (which never appears in
 * the capture), a small toolbar and a bar with the keys. Every stroke goes to the main process as
 * data when the pen lifts, on the main process's clock; the video stays as the screen was. A
 * board (white or black) can go over the region to explain something: it is drawn here for the
 * teacher, the screen goes on being recorded underneath, and the lesson gets it as a "quadro"
 * clip. Keys with the window in focus: B white board, N black board (the same key again takes it
 * away), P new page, Ctrl+Z undo, Shift for a straight stroke, Esc to stop drawing.
 */
export function DrawLayer({
  region,
  on,
  live,
  palette,
  toggleKey,
  onExit,
}: {
  region: Rect;
  /** The drawing mode: the canvas takes the mouse. */
  on: boolean;
  /** A take is recording: strokes count. Off, the strokes on screen are dropped. */
  live: boolean;
  /** The lesson's colors, its accent first. */
  palette: readonly string[];
  toggleKey: string;
  onExit: () => void;
}): ReactNode {
  const colors = (palette.length ? palette : FALLBACK).slice(0, 8);
  const [board, setBoard] = useState<BoardKind | null>(null);
  // The pen's color follows the background (dark on white, chalk on black, the accent over the
  // screen) until the teacher picks another one from the palette.
  const inkFor = useCallback(
    (kind: BoardKind | null): string => (kind ? BOARD_INK[kind] : colors[0]),
    [colors],
  );
  const [color, setColor] = useState(colors[0]);
  const [width, setWidth] = useState<number>(DRAWING_WIDTHS[1]);
  const [tool, setTool] = useState<DrawingTool>("pen");
  const strokes = useRef<LiveStroke[]>([]);
  const current = useRef<LiveStroke | null>(null);
  const offset = useRef<number | null>(null);
  /**
   * What was drawn before the clock was measured (the first moments after turning drawing on):
   * sent once it is, each at its own moment.
   */
  const pending = useRef<((offset: number) => void)[]>([]);
  const measuring = useRef(false);
  const exit = useRef(onExit);
  exit.current = onExit;
  /** Ends the stroke under way as if the pen lifted (set below, read by the effects). */
  const lift = useRef<() => void>(() => undefined);
  /** Sends `send` with the main process's clock at this moment (QPC ms), now or once it is known. */
  const stamp = useCallback((send: (qpc: number) => void): void => {
    const now = performance.now();
    const o = offset.current;
    if (o !== null) send(now + o);
    else pending.current.push((known) => send(now + known));
  }, []);
  const canvas = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef(board);
  boardRef.current = board;
  const tools = useUiRect<HTMLFieldSetElement>("draw-tools", on);

  const paint = useCallback(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(window.innerWidth * dpr);
    const h = Math.round(window.innerHeight * dpr);
    if (el.width !== w || el.height !== h) {
      el.width = w;
      el.height = h;
    }
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const box = [region.width * dpr, region.height * dpr, region.x * dpr, region.y * dpr] as const;
    const up = boardRef.current;
    if (up) paintBoard(ctx, BOARD_COLORS[up], ...box);
    const all = current.current ? [...strokes.current, current.current] : strokes.current;
    const visible: VisibleStroke[] = all.map((s) => ({
      color: s.color,
      width: s.width,
      tool: s.tool,
      points: s.points.map(([x, y]) => [x, y]),
    }));
    paintStrokes(ctx, visible, ...box);
  }, [region]);

  useEffect(() => {
    paint();
    window.addEventListener("resize", paint);
    return () => window.removeEventListener("resize", paint);
  }, [paint]);

  /** Puts a board up (or another one), or takes it away: here and in the take's data. */
  const switchBoard = useCallback(
    (next: BoardKind | null): void => {
      const before = boardRef.current;
      if (before === next) return;
      stamp((at) => {
        if (before) void window.api.recorder.drawBoard(false, before, at);
        if (next) void window.api.recorder.drawBoard(true, next, at);
      });
      boardRef.current = next;
      setBoard(next);
      setColor(inkFor(next));
      // A board starts clean, and its strokes go with it.
      strokes.current = [];
      current.current = null;
      paint();
    },
    [inkFor, paint, stamp],
  );

  // The clock is measured when drawing is turned on, before the first stroke needs it; leaving
  // the drawing takes the board away.
  useEffect(() => {
    drawing.on = on;
    if (on && offset.current === null && !measuring.current) {
      measuring.current = true;
      void measureOffset()
        .then(
          (o) => {
            offset.current = o;
            for (const send of pending.current.splice(0)) send(o);
          },
          (error: unknown) => {
            // Without the clock nothing drawn could be placed in the take: drawing stops.
            pending.current = [];
            console.warn("[recorder] relógio do desenho:", error);
            exit.current();
          },
        )
        .finally(() => {
          measuring.current = false;
        });
    }
    if (!on) {
      // A pause (or leaving the drawing) mid-stroke ends the stroke there: its points stay on
      // the take's clock, and nothing drawn after the pause joins it.
      lift.current();
      switchBoard(null);
    }
    return () => {
      drawing.on = false;
    };
  }, [on, switchBoard]);

  // Outside a take nothing drawn stays on screen.
  useEffect(() => {
    if (live) return;
    strokes.current = [];
    current.current = null;
    paint();
  }, [live, paint]);

  const at = (e: ReactPointerEvent | PointerEvent): [number, number] => [
    (e.clientX - region.x) / region.width,
    (e.clientY - region.y) / region.height,
  ];

  const down = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!on || !live || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = at(e);
    current.current = { start: performance.now(), color, width, tool, points: [[x, y, 0]] };
    paint();
  };
  const move = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    const s = current.current;
    if (!s) return;
    // An arrow, or any stroke with Shift held, goes straight from where it started.
    if (s.tool === "arrow" || e.shiftKey) {
      const [x, y] = at(e);
      s.points = [s.points[0], [x, y, Math.max(0, e.timeStamp - s.start)]];
      paint();
      return;
    }
    // Every pointer sample, including the ones the browser merged into this event.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events) {
      if (s.points.length >= MAX_STROKE_POINTS * 4) break;
      const [x, y] = at(ev);
      const last = s.points[s.points.length - 1];
      if (Math.abs(x - last[0]) + Math.abs(y - last[1]) < 0.0008) continue;
      s.points.push([x, y, Math.max(last[2], ev.timeStamp - s.start)]);
    }
    paint();
  };
  const up = (): void => {
    const s = current.current;
    current.current = null;
    if (!s) return;
    strokes.current.push(s);
    paint();
    const points = new Float32Array(s.points.length * 3);
    for (const [i, p] of s.points.entries()) points.set(p, i * 3);
    const send = (o: number): void =>
      void window.api.recorder
        .drawStroke({
          at: s.start + o,
          color: s.color,
          width: s.width,
          points,
          ...(s.tool !== "pen" ? { tool: s.tool } : {}),
        })
        .catch((error: unknown) => console.warn("[recorder] traço do desenho:", error));
    // The stroke has its own start: only the clock may still be on its way.
    const o = offset.current;
    if (o !== null) send(o);
    else pending.current.push(send);
  };
  lift.current = up;
  const clear = useCallback((): void => {
    strokes.current = [];
    current.current = null;
    paint();
    stamp((t) => void window.api.recorder.drawClear(t));
  }, [paint, stamp]);
  /** "Página nova": the board stays, the strokes on it go. */
  const newPage = useCallback((): void => {
    if (!boardRef.current) return;
    strokes.current = [];
    current.current = null;
    paint();
    stamp((t) => void window.api.recorder.drawPage(t));
  }, [paint, stamp]);
  const undo = useCallback((): void => {
    if (current.current || !strokes.current.length) return;
    strokes.current.pop();
    paint();
    stamp((t) => void window.api.recorder.drawUndo(t));
  }, [paint, stamp]);

  // The board's keys, with the recorder window in focus.
  useEffect(() => {
    if (!on || !live) return;
    const key = (e: KeyboardEvent): void => {
      if (e.repeat) return;
      if (e.code === "Escape") {
        e.preventDefault();
        onExit();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === "KeyZ") {
        e.preventDefault();
        undo();
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      if (e.code === "KeyB") switchBoard(boardRef.current === "white" ? null : "white");
      else if (e.code === "KeyN") switchBoard(boardRef.current === "black" ? null : "black");
      else if (e.code === "KeyP") newPage();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [on, live, onExit, undo, newPage, switchBoard]);

  return (
    <>
      <canvas
        ref={canvas}
        className={`rec-draw ${on ? "is-on" : ""}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      {on && (
        <fieldset
          ref={tools}
          className="rec-draw-tools"
          aria-label="Desenho na tela"
          style={{
            left: Math.max(8, region.x + 12),
            top: Math.max(8, region.y + 12),
          }}
        >
          {TOOLS.map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              key={id}
              className={`rec-draw-tool ${tool === id ? "is-active" : ""}`}
              title={label}
              aria-label={label}
              aria-pressed={tool === id}
              onClick={() => setTool(id)}
            >
              <Icon size={15} />
            </button>
          ))}
          <span className="rec-draw-sep" />
          {colors.map((c) => (
            <button
              type="button"
              key={c}
              className={`rec-draw-color ${c === color ? "is-active" : ""}`}
              style={{ background: c }}
              title={colorName(c)}
              aria-label={`Cor ${colorName(c)}`}
              aria-pressed={c === color}
              onClick={() => setColor(c)}
            />
          ))}
          <span className="rec-draw-sep" />
          {DRAWING_WIDTHS.map((w, i) => (
            <button
              type="button"
              key={w}
              className={`rec-draw-width ${w === width ? "is-active" : ""}`}
              title={`Espessura ${DRAWING_WIDTH_NAMES[i].toLowerCase()}`}
              aria-label={`Espessura ${DRAWING_WIDTH_NAMES[i].toLowerCase()}`}
              aria-pressed={w === width}
              onClick={() => setWidth(w)}
            >
              <i style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}
          <span className="rec-draw-sep" />
          <button
            type="button"
            className={board === "white" ? "is-active" : undefined}
            title="Quadro branco (B)"
            aria-pressed={board === "white"}
            onClick={() => switchBoard(board === "white" ? null : "white")}
          >
            <span className="rec-board-dot is-white" /> Branco
          </button>
          <button
            type="button"
            className={board === "black" ? "is-active" : undefined}
            title="Quadro negro (N)"
            aria-pressed={board === "black"}
            onClick={() => switchBoard(board === "black" ? null : "black")}
          >
            <span className="rec-board-dot is-black" /> Negro
          </button>
          <span className="rec-draw-sep" />
          <button type="button" title="Apagar tudo" onClick={clear}>
            <Eraser size={15} /> Apagar tudo
          </button>
          <button
            type="button"
            title={`Parar de desenhar (Esc ou ${toggleKey})`}
            aria-label="Parar de desenhar"
            onClick={onExit}
          >
            <X size={15} />
          </button>
        </fieldset>
      )}
      {on && (
        <div
          className="rec-draw-keys"
          aria-hidden="true"
          style={{
            left: region.x + region.width / 2,
            top: Math.min(window.innerHeight - 40, region.y + region.height - 44),
          }}
        >
          <span>
            <kbd>B</kbd> quadro branco
          </span>
          <span>
            <kbd>N</kbd> quadro negro
          </span>
          {board && (
            <span>
              <kbd>P</kbd> página nova
            </span>
          )}
          <span>
            <kbd>Ctrl+Z</kbd> desfazer
          </span>
          <span>
            <kbd>Shift</kbd> traço reto
          </span>
          <span>
            <kbd>Esc</kbd> sair
          </span>
        </div>
      )}
    </>
  );
}
