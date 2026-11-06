import { clock } from "@shared/ranges";
import { useRef, useState } from "react";
import { seek } from "../lib/media";
import { useStore } from "../state/store";

/** The progress bar; hovering shows the frame under the pointer from the file's frame sheet. */
export function SeekBar() {
  const time = useStore((s) => s.time);
  const duration = useStore((s) => s.duration);
  const sheet = useStore((s) => s.sheet);
  const ab = useStore((s) => s.ab);
  const source = useStore((s) => s.source);
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const asked = useRef<string | null>(null);
  const at = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !(duration > 0)) return 0;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration;
  };
  const ensureSheet = () => {
    const path = source?.facts.path;
    if (!path || sheet || asked.current === path || !source?.facts.hasVideo) return;
    asked.current = path;
    void window.api
      .frameSheet(path)
      .then((s) => {
        if (useStore.getState().source?.facts.path === path) useStore.setState({ sheet: s });
      })
      .catch(() => undefined);
  };
  const share = (t: number) => `${duration > 0 ? (t / duration) * 100 : 0}%`;
  let tile: React.CSSProperties | null = null;
  if (hover !== null && sheet) {
    const i = Math.min(sheet.count - 1, Math.floor(hover / Math.max(0.001, sheet.step)));
    const scale = 144 / sheet.tileWidth;
    tile = {
      width: 144,
      height: Math.round(sheet.tileHeight * scale),
      backgroundImage: `url("${sheet.url}")`,
      backgroundSize: `${sheet.columns * 144}px ${sheet.rows * sheet.tileHeight * scale}px`,
      backgroundPosition: `-${(i % sheet.columns) * 144}px -${Math.floor(i / sheet.columns) * sheet.tileHeight * scale}px`,
    };
  }
  return (
    <div className="seek">
      <span className="t">{clock(time)}</span>
      <div
        ref={ref}
        className="track"
        role="slider"
        tabIndex={0}
        aria-label="Posição do vídeo"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={clock(time)}
        onPointerMove={(e) => {
          ensureSheet();
          setHover(at(e.clientX));
          if (e.buttons === 1) seek(at(e.clientX));
        }}
        onPointerLeave={() => setHover(null)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seek(at(e.clientX));
        }}
      >
        <span className="rail" />
        {ab && (
          <span
            className="ab"
            style={{ left: share(ab.a), width: ab.b === null ? 2 : share(ab.b - ab.a) }}
          />
        )}
        <span className="played" style={{ width: share(time) }} />
        <span className="knob" style={{ left: share(time) }} />
        {hover !== null && (
          <span className="hover-preview" style={{ left: share(hover) }}>
            {tile && <span className="tile" style={tile} />}
            <span className="when">{clock(hover)}</span>
          </span>
        )}
      </div>
      <span className="t end">{clock(duration)}</span>
    </div>
  );
}
