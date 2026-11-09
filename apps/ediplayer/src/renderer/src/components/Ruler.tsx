import {
  clock,
  invertRanges,
  isPartRemoved,
  keptRanges,
  moveCut,
  normalizeRanges,
  piecesFromPoints,
  snapDrift,
  totalDuration,
} from "@shared/ranges";
import { X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { seek } from "../lib/media";
import { edit, selectMark, selectOnRuler, useStore } from "../state/store";

const TILES = 12;
const BARS = 240;
const ZOOMS = [1, 2, 4, 8, 16, 32, 64];

/**
 * The cut ruler: frames, sound, the stretches that go out, the cuts with their handles and the
 * needle. Zoomed in, it is wider than the panel and scrolls sideways, following the needle.
 */
export function Ruler() {
  const duration = useStore((s) => s.duration);
  const time = useStore((s) => s.time);
  const playing = useStore((s) => s.playing);
  const sheet = useStore((s) => s.sheet);
  const wave = useStore((s) => s.wave);
  const marks = useStore((s) => s.marks);
  const selected = useStore((s) => s.selected);
  const pendingIn = useStore((s) => s.pendingIn);
  const mode = useStore((s) => s.mode);
  const splitPoints = useStore((s) => s.splitPoints);
  const part = useStore((s) => s.part);
  const ref = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [zoom, setZoom] = useState(1);
  // Where to keep a time on screen after the zoom changes: [time, offset in the viewport].
  const anchor = useRef<[number, number] | null>(null);
  // Up to about two seconds on screen: a frame is then several pixels wide.
  const maxZoom = ZOOMS.filter((z) => z === 1 || duration / z >= 2).at(-1) ?? 1;
  const pct = (t: number) => `${duration > 0 ? (t / duration) * 100 : 0}%`;
  const at = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !(duration > 0)) return 0;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration;
  };
  const zoomTo = (next: number, clientX?: number) => {
    const view = scroller.current;
    const z = Math.max(1, Math.min(maxZoom, next));
    if (!view || z === zoom) return;
    const box = view.getBoundingClientRect();
    // The cursor's time stays under the cursor; from the buttons, the needle stays in view.
    const t = clientX === undefined ? useStore.getState().time : at(clientX);
    const offset = clientX === undefined ? box.width / 2 : clientX - box.left;
    anchor.current = [t, offset];
    setZoom(z);
  };
  // A new video starts showing the whole of it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the video changes.
  useEffect(() => setZoom(1), [duration]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs after the zoom changes the width.
  useLayoutEffect(() => {
    const view = scroller.current;
    const pending = anchor.current;
    if (!view || !pending || !(duration > 0)) return;
    anchor.current = null;
    view.scrollLeft = (pending[0] / duration) * view.scrollWidth - pending[1];
  }, [zoom, duration]);
  // Ctrl + wheel zooms where the cursor is; the wheel alone scrolls the zoomed ruler sideways.
  // A native listener: React's wheel handler is passive and cannot stop the page zoom.
  useEffect(() => {
    const view = scroller.current;
    if (!view) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const i = ZOOMS.indexOf(zoom);
        zoomTo(ZOOMS.at(e.deltaY < 0 ? i + 1 : Math.max(0, i - 1)) ?? zoom, e.clientX);
      } else if (zoom > 1 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        view.scrollLeft += e.deltaY;
      }
    };
    view.addEventListener("wheel", onWheel, { passive: false });
    return () => view.removeEventListener("wheel", onWheel);
  });
  // The needle never leaves the screen while playing or moved by the keys.
  useEffect(() => {
    const view = scroller.current;
    if (!view || zoom === 1 || !(duration > 0) || dragging.current) return;
    const x = (time / duration) * view.scrollWidth;
    if (x < view.scrollLeft + 20 || x > view.scrollLeft + view.clientWidth - 40)
      view.scrollLeft = x - view.clientWidth * (playing ? 0.15 : 0.5);
  }, [time, zoom, duration, playing]);
  const out = useMemo(
    () => (mode === "remove" ? normalizeRanges(marks, duration) : invertRanges(marks, duration)),
    [marks, mode, duration],
  );
  const bars = useMemo(() => {
    if (!wave?.length) return [];
    // Never more bars than samples: every bar takes at least one, so short clips span the ruler.
    const count = Math.min(BARS * zoom, wave.length);
    const per = wave.length / count;
    // Each bar is keyed by where it sits on the ruler.
    return Array.from({ length: count }, (_, i) => {
      let peak = 0;
      const from = Math.floor(i * per);
      const to = Math.max(from + 1, Math.floor((i + 1) * per));
      for (let j = from; j < to; j++) peak = Math.max(peak, wave.at(j) ?? 0);
      return { at: `bar-${i / count}`, peak };
    });
  }, [wave, zoom]);
  const ticks = useMemo(() => {
    const steps = [0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 900, 1800, 3600];
    const shown = duration / zoom;
    const step = steps.find((s) => shown / s <= 8) ?? 3600;
    // The last label stays clear of the right edge.
    return Array.from({ length: Math.floor(duration / step) + 1 }, (_, i) => i * step).filter(
      (t) => t < duration - step * 0.4,
    );
  }, [duration, zoom]);
  const fine = duration / zoom < 16;
  const tiles = TILES * zoom;
  const parts = piecesFromPoints(splitPoints, duration);
  const sel = selected === null ? undefined : marks.at(selected);
  const clicked = part === null ? undefined : parts.at(part);
  const cuts = [...splitPoints].sort((a, b) => a - b);
  const dragHandle = (e: React.PointerEvent<HTMLElement>, side: "start" | "end") => {
    e.stopPropagation();
    if (selected === null) return;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const base = useStore.getState().marks;
    let moved = base;
    const move = (ev: PointerEvent) => {
      const t = at(ev.clientX);
      moved = base.map((m, i) =>
        i !== selected
          ? m
          : side === "start"
            ? { ...m, start: Math.min(t, m.end - 0.1) }
            : { ...m, end: Math.max(t, m.start + 0.1) },
      );
      useStore.setState({ marks: moved });
      seek(t);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      useStore.setState({ marks: base });
      const dragged = moved.at(selected);
      const next = normalizeRanges(moved, duration);
      // Merging may renumber the stretches: keep the selection on the one that was dragged.
      const at = dragged
        ? next.findIndex((m) => m.start <= dragged.start + 1e-6 && m.end >= dragged.end - 1e-6)
        : -1;
      edit({ marks: next, selected: at < 0 ? null : at });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  /**
   * A cut's handle, as the clip edges in EdiAula: dragging moves the cut (and the edge of a
   * deleted part sitting on it) and shows that frame; one undo step per drag.
   */
  const dragCut = (e: React.PointerEvent<HTMLElement>, index: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    dragging.current = true;
    const start = useStore.getState();
    const base = { points: start.splitPoints, marks: start.marks };
    const keep = start.part;
    let moved = base;
    const move = (ev: PointerEvent) => {
      moved = moveCut(base.points, base.marks, index, at(ev.clientX), duration);
      useStore.setState({ splitPoints: moved.points, marks: moved.marks });
      seek(moved.points.at(index) ?? 0);
    };
    const up = () => {
      dragging.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      useStore.setState({ splitPoints: base.points, marks: base.marks });
      if (moved !== base) edit({ splitPoints: moved.points, marks: moved.marks, part: keep });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  // The drags listen on the window: a lost pointer capture (the element re-rendered under the
  // pointer, another window) must not leave a drag half done.
  /** The needle's head: dragging it only moves through the video, never changes the selection. */
  const scrub = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    target.classList.add("dragging");
    dragging.current = true;
    const move = (ev: PointerEvent) => seek(at(ev.clientX));
    const up = () => {
      dragging.current = false;
      target.classList.remove("dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const zoomIndex = ZOOMS.indexOf(zoom);
  return (
    <>
      <div className="ruler-bar">
        <span className="hint">
          <kbd>S</kbd> divide na agulha · clique num pedaço e <kbd>Del</kbd> apaga · arraste as
          alças dos cortes para ajustar
        </span>
        <fieldset className="zoom" aria-label="Zoom da régua">
          <button
            type="button"
            className="icon-btn"
            aria-label="Afastar a régua"
            title="Afastar (Ctrl + roda do mouse)"
            disabled={zoom === 1}
            onClick={() => zoomTo(ZOOMS.at(Math.max(0, zoomIndex - 1)) ?? 1)}
          >
            <ZoomOut size={15} />
          </button>
          <span className="mono level">{zoom}×</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Aproximar a régua"
            title="Aproximar (Ctrl + roda do mouse)"
            disabled={zoom >= maxZoom}
            onClick={() => zoomTo(ZOOMS.at(zoomIndex + 1) ?? zoom)}
          >
            <ZoomIn size={15} />
          </button>
          {zoom > 1 && (
            <button type="button" className="link" onClick={() => zoomTo(1)}>
              Ver tudo
            </button>
          )}
        </fieldset>
      </div>
      <div ref={scroller} className="ruler-scroll">
        <div className="scale" aria-hidden="true" style={{ width: `${zoom * 100}%` }}>
          {ticks.map((t) => (
            <span key={t} style={{ left: pct(t) }}>
              {clock(t, fine)}
            </span>
          ))}
        </div>
        <div
          ref={ref}
          className="ruler"
          role="slider"
          tabIndex={0}
          aria-label="Régua de corte"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={clock(time)}
          style={{ width: `${zoom * 100}%` }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const t = at(e.clientX);
            seek(t);
            selectOnRuler(t);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) seek(at(e.clientX));
          }}
        >
          <div className="strip">
            {Array.from({ length: tiles }, (_, i) => {
              const t = ((i + 0.5) / tiles) * duration;
              if (!sheet) return <span key={`tile-${t}`} className="tile" />;
              const n = Math.min(sheet.count - 1, Math.floor(t / Math.max(0.001, sheet.step)));
              const w = 100 * sheet.columns;
              return (
                <span
                  key={`tile-${t}`}
                  className="tile"
                  style={{
                    backgroundImage: `url("${sheet.url}")`,
                    backgroundSize: `${w}% ${100 * sheet.rows}%`,
                    backgroundPosition: `${((n % sheet.columns) / Math.max(1, sheet.columns - 1)) * 100}% ${(Math.floor(n / sheet.columns) / Math.max(1, sheet.rows - 1)) * 100}%`,
                  }}
                />
              );
            })}
          </div>
          <div className="wave" aria-hidden="true">
            {bars.map((b) => (
              <span key={b.at} style={{ height: `${Math.max(4, b.peak * 100)}%` }} />
            ))}
          </div>
          {out.map((r) => (
            <span
              key={`${r.start}-${r.end}`}
              className="cut-zone"
              style={{ left: pct(r.start), width: pct(r.end - r.start) }}
            />
          ))}
          {sel && (
            <>
              <span
                className="mark-sel"
                style={{ left: pct(sel.start), width: pct(sel.end - sel.start) }}
              />
              <span
                className="handle in"
                role="presentation"
                style={{ left: pct(sel.start) }}
                onPointerDown={(e) => dragHandle(e, "start")}
              />
              <span
                className="handle out"
                role="presentation"
                style={{ left: pct(sel.end) }}
                onPointerDown={(e) => dragHandle(e, "end")}
              />
              <span
                className="flag"
                style={{ left: pct(sel.start), transform: "translateX(-100%)" }}
              >
                I {clock(sel.start)}
              </span>
              <span className="flag" style={{ left: pct(sel.end) }}>
                O {clock(sel.end)}
              </span>
            </>
          )}
          {clicked && (
            <>
              <span
                className="part-sel"
                style={{ left: pct(clicked.start), width: pct(clicked.end - clicked.start) }}
              />
              <span className="part-flag" style={{ left: pct((clicked.start + clicked.end) / 2) }}>
                {isPartRemoved(clicked, marks, mode, duration)
                  ? "Apagado · Ctrl+Z volta"
                  : "Del apaga"}
              </span>
            </>
          )}
          {pendingIn !== null && <span className="pending-in" style={{ left: pct(pendingIn) }} />}
          {cuts.map((p, i) => {
            // The clicked part's edges get EdiAula's colours: green where it starts, red where
            // it ends.
            const edge = !clicked
              ? ""
              : Math.abs(p - clicked.start) < 1e-6
                ? " start"
                : Math.abs(p - clicked.end) < 1e-6
                  ? " end"
                  : "";
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: the n-th cut stays the same element while dragged (its time changes on every move).
                key={`cut-${i}`}
                className={`cut-handle${edge}`}
                role="presentation"
                title={`Corte em ${clock(p, true)}: arraste para ajustar`}
                style={{ left: pct(p) }}
                onPointerDown={(e) => dragCut(e, i)}
              >
                <span className="cut-line" />
                <span className="cut-knob" />
              </span>
            );
          })}
          <span className="playhead" style={{ left: pct(time) }} />
          <span
            className="playhead-grip"
            role="presentation"
            title="Arraste para andar pelo vídeo"
            style={{ left: pct(time) }}
            onPointerDown={scrub}
          />
          <span className="playhead-tag" style={{ left: pct(time) }}>
            {clock(time, fine)}
          </span>
        </div>
      </div>
    </>
  );
}

/** The marked stretches and what the result will be. */
export function MarksAndResult() {
  const marks = useStore((s) => s.marks);
  const selected = useStore((s) => s.selected);
  const mode = useStore((s) => s.mode);
  const duration = useStore((s) => s.duration);
  const keyframes = useStore((s) => s.keyframes);
  const pendingIn = useStore((s) => s.pendingIn);
  const kept = keptRanges(marks, mode, duration);
  const result = totalDuration(kept);
  const precise = useStore((s) => s.precise);
  // Only when the person chose to never re-encode: by default the cut is exact.
  const drift = !precise && keyframes?.length ? snapDrift(kept, keyframes) : 0;
  return (
    <div className="below-ruler">
      <div className="marks">
        <span className="label" style={{ marginBottom: 4 }}>
          Trechos marcados
        </span>
        {!marks.length && (
          <span className="info">
            {pendingIn !== null
              ? `Entrada em ${clock(pendingIn)}. Vá até o fim do trecho e aperte O.`
              : "Aperte I no começo de um trecho e O no fim. Sem trechos, o vídeo inteiro é salvo."}
          </span>
        )}
        {marks.map((m, i) => (
          <div key={`${m.start}-${m.end}`} className={`mark-row${i === selected ? " sel" : ""}`}>
            <button
              type="button"
              className="mark-row"
              style={{ padding: 0, height: "auto" }}
              onClick={() => selectMark(i)}
            >
              <span className="n">{i + 1}</span>
              <span className="mono">
                {clock(m.start, true)} → {clock(m.end, true)}
              </span>
              <span className="mono quiet">{clock(m.end - m.start)}</span>
              <span className={mode === "remove" ? "tag-out" : "tag-keep"}>
                {mode === "remove" ? "sai" : "fica"}
              </span>
            </button>
            <button
              type="button"
              className="icon-btn"
              style={{ width: 28, height: 28 }}
              aria-label={`Apagar trecho ${i + 1}`}
              onClick={() => edit({ marks: marks.filter((_, j) => j !== i), selected: null })}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="result">
        <span className="label">Resultado</span>
        <span className="big">{clock(result)}</span>
        <span className="muted">
          de {clock(duration)}
          {marks.length
            ? ` · ${mode === "remove" ? `saem ${clock(duration - result)}` : `ficam ${marks.length} ${marks.length === 1 ? "trecho" : "trechos"}`}`
            : ""}
        </span>
        {drift > 0.05 && (
          <span className="info">
            Sem recodificar, um corte pode começar até {drift.toFixed(1).replace(".", ",")} s antes
            (quadro-chave).
          </span>
        )}
      </div>
    </div>
  );
}
