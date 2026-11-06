import {
  clock,
  invertRanges,
  keptRanges,
  normalizeRanges,
  snapDrift,
  totalDuration,
} from "@shared/ranges";
import { X } from "lucide-react";
import { useMemo, useRef } from "react";
import { seek } from "../lib/media";
import { edit, selectMark, useStore } from "../state/store";

const TILES = 12;
const BARS = 240;

/** The cut ruler: frames, sound, the stretches that go out, the selected one's handles. */
export function Ruler() {
  const duration = useStore((s) => s.duration);
  const time = useStore((s) => s.time);
  const sheet = useStore((s) => s.sheet);
  const wave = useStore((s) => s.wave);
  const marks = useStore((s) => s.marks);
  const selected = useStore((s) => s.selected);
  const pendingIn = useStore((s) => s.pendingIn);
  const mode = useStore((s) => s.mode);
  const splitPoints = useStore((s) => s.splitPoints);
  const ref = useRef<HTMLDivElement>(null);
  const pct = (t: number) => `${duration > 0 ? (t / duration) * 100 : 0}%`;
  const at = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !(duration > 0)) return 0;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration;
  };
  const out = useMemo(
    () => (mode === "remove" ? normalizeRanges(marks, duration) : invertRanges(marks, duration)),
    [marks, mode, duration],
  );
  const bars = useMemo(() => {
    if (!wave?.length) return [];
    const per = wave.length / BARS;
    // Each bar is keyed by where it sits on the ruler.
    return Array.from({ length: Math.min(BARS, wave.length) }, (_, i) => {
      let peak = 0;
      for (let j = Math.floor(i * per); j < Math.floor((i + 1) * per); j++)
        peak = Math.max(peak, wave.at(j) ?? 0);
      return { at: `bar-${i / BARS}`, peak };
    });
  }, [wave]);
  const ticks = useMemo(() => {
    const steps = [10, 30, 60, 120, 300, 600, 900, 1800, 3600];
    const step = steps.find((s) => duration / s <= 8) ?? 3600;
    // The last label stays clear of the right edge.
    return Array.from({ length: Math.floor(duration / step) + 1 }, (_, i) => i * step).filter(
      (t) => t < duration - step * 0.4,
    );
  }, [duration]);
  const sel = selected === null ? undefined : marks.at(selected);
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
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      useStore.setState({ marks: base });
      edit({ marks: normalizeRanges(moved, duration) });
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };
  return (
    <>
      <div className="scale" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} style={{ left: pct(t) }}>
            {clock(t)}
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
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const t = at(e.clientX);
          seek(t);
          const hit = marks.findIndex((m) => m.start <= t && m.end >= t);
          useStore.setState({ selected: hit < 0 ? null : hit });
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) seek(at(e.clientX));
        }}
      >
        <div className="strip">
          {Array.from({ length: TILES }, (_, i) => {
            const t = ((i + 0.5) / TILES) * duration;
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
            <span className="flag" style={{ left: pct(sel.start), transform: "translateX(-100%)" }}>
              I {clock(sel.start)}
            </span>
            <span className="flag" style={{ left: pct(sel.end) }}>
              O {clock(sel.end)}
            </span>
          </>
        )}
        {pendingIn !== null && <span className="pending-in" style={{ left: pct(pendingIn) }} />}
        {splitPoints.map((p) => (
          <span key={p} className="split-line" style={{ left: pct(p) }} />
        ))}
        <span className="playhead" style={{ left: pct(time) }} />
        <span className="playhead-tag" style={{ left: pct(time) }}>
          {clock(time)}
        </span>
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
  const drift = keyframes?.length ? snapDrift(kept, keyframes) : 0;
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
                {clock(m.start)} → {clock(m.end)}
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
