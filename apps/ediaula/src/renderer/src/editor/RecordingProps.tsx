import { type CursorFx, DEFAULT_CURSOR_FX, editedCursorAt } from "@shared/cursor";
import { clipEnd, sourceAt, sourceEnd, timelineAt } from "@shared/timeline";
import type { Asset, Clip } from "@shared/types";
import { autoZooms, DEFAULT_AUTO_ZOOM, editZoomsIn, type Zoom, zoomsIn } from "@shared/zoom";
import { Crosshair, MousePointer2, Plus, Trash2, Wand2, X, ZoomIn } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { Button, Toggle } from "@/ui";
import { Slider } from "./ClipVisual";
import { cursorFxOf, loadCursorData } from "./CursorLayer";

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

export function setCursorFx(assetId: string, changes: Partial<CursorFx>): void {
  useProject.getState().commit((p) => ({
    ...p,
    assets: p.assets.map((a) =>
      a.id === assetId
        ? { ...a, cursorFx: { ...DEFAULT_CURSOR_FX, ...a.cursorFx, ...changes } }
        : a,
    ),
  }));
}

/** How the recorded pointer is drawn (applies to every clip of the recording). */
export function CursorSection({ asset }: { asset: Asset }): ReactNode {
  const fx = cursorFxOf(asset);
  const set = (c: Partial<CursorFx>): void => {
    setCursorFx(asset.id, c);
  };
  return (
    <div className="props-section">
      <div className="props-head">
        <h3>
          <MousePointer2 size={13} /> Cursor
        </h3>
        <Toggle on={!fx.hidden} onChange={(v) => set({ hidden: !v })} label="Mostrar cursor" />
      </div>
      {fx.hidden ? (
        <p className="props-hint muted">
          O cursor foi gravado à parte e está escondido neste vídeo.
        </p>
      ) : (
        <>
          <Slider
            label="Tamanho"
            value={fx.size}
            min={0.8}
            max={4}
            step={0.05}
            onCommit={(v) => set({ size: v })}
          />
          <Slider
            label="Suavizar"
            value={fx.smooth}
            min={0}
            max={0.95}
            step={0.05}
            onCommit={(v) => set({ smooth: v })}
          />
          <ToggleRow label="Onda nos cliques" on={fx.clicks} onChange={(v) => set({ clicks: v })} />
          <ToggleRow label="Halo amarelo" on={fx.halo} onChange={(v) => set({ halo: v })} />
          <ToggleRow
            label="Esconder quando parado"
            on={fx.hideIdle}
            onChange={(v) => set({ hideIdle: v })}
          />
          <ToggleRow
            label="Mostrar teclas (atalhos e setas)"
            on={fx.keys !== false}
            onChange={(v) => set({ keys: v })}
          />
        </>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}): ReactNode {
  return (
    <div className="toggle-row">
      <span className="muted">{label}</span>
      <Toggle on={on} onChange={onChange} label={label} />
    </div>
  );
}

/**
 * Edits the zooms this clip shows. They belong to the recording (shared/zoom.ts): the other
 * clips of it see the change over the same moments, and a zoom taken out stays out.
 */
function updateZooms(clip: Clip, fn: (z: Zoom[]) => Zoom[]): void {
  useProject.getState().commit((p) => ({
    ...p,
    assets: p.assets.map((a) => {
      if (a.id !== clip.assetId) return a;
      const { zooms: old, ...rest } = a;
      const zooms = editZoomsIn(old, clip.in, sourceEnd(clip), fn);
      return zooms ? { ...rest, zooms } : rest;
    }),
  }));
}

/** Generates zooms on the clicks of a recording (replacing earlier automatic ones). Returns how many. */
export async function applyAutoZoom(
  clip: Clip,
  asset: Asset,
  scale = DEFAULT_AUTO_ZOOM.scale,
): Promise<number> {
  if (!asset.cursor) return 0;
  const data = await loadCursorData(asset.cursor);
  const fx = cursorFxOf(asset);
  const adjusted = {
    ...data,
    moves: data.moves.map(([t, x, y, shape]) => {
      const p = editedCursorAt(fx, t);
      return [t, p?.x ?? x, p?.y ?? y, shape] as [number, number, number, number];
    }),
    clicks: data.clicks.map(([t, x, y, b, d]) => {
      const p = editedCursorAt(fx, t);
      return [t, p?.x ?? x, p?.y ?? y, b, d] as [number, number, number, number, number];
    }),
  };
  const zooms = autoZooms(adjusted, asset.duration, { ...DEFAULT_AUTO_ZOOM, scale }).filter(
    (z) => z.end > clip.in && z.start < sourceEnd(clip),
  );
  updateZooms(clip, (old) => [...old.filter((z) => !z.auto), ...zooms]);
  return zooms.length;
}

export function ZoomSection({ clip, asset }: { clip: Clip; asset: Asset }): ReactNode {
  const zooms = zoomsIn(asset.zooms, clip.in, sourceEnd(clip));
  const [scale, setScale] = useState(zooms.find((z) => z.auto)?.scale ?? DEFAULT_AUTO_ZOOM.scale);
  const time = usePlayback((s) => s.time);
  const toTimeline = (src: number): number => timelineAt(clip, src);
  const toast = useApp((s) => s.toast);

  const addHere = async (): Promise<void> => {
    const src = sourceAt(
      clip,
      clip.start + Math.max(0, Math.min(clip.duration, time - clip.start)),
    );
    let focus = { t: src, x: 0.5, y: 0.5 };
    if (asset.cursor) {
      const data = await loadCursorData(asset.cursor);
      const m = [...data.moves].reverse().find((v) => v[0] <= src);
      if (m)
        focus = {
          t: src,
          x: Math.min(1, Math.max(0, m[1] / data.width)),
          y: Math.min(1, Math.max(0, m[2] / data.height)),
        };
    }
    const z: Zoom = {
      id: `m${Date.now()}`,
      start: Math.max(clip.in, src - 0.5),
      end: Math.min(sourceEnd(clip), src + 3),
      scale,
      focus: [focus],
    };
    updateZooms(clip, (old) => [...old, z]);
  };

  return (
    <div className="props-section">
      <div className="props-head">
        <h3>
          <ZoomIn size={13} /> Zoom
        </h3>
        {zooms.length > 0 && (
          <button type="button" className="link-btn" onClick={() => updateZooms(clip, () => [])}>
            <Trash2 size={12} /> Tirar todos
          </button>
        )}
      </div>
      <Slider
        label="Aproximação"
        value={scale}
        min={1.2}
        max={3}
        step={0.05}
        onCommit={(v) => {
          setScale(v);
          if (zooms.length) updateZooms(clip, (old) => old.map((z) => ({ ...z, scale: v })));
        }}
      />
      <div className="row-6">
        {asset.cursor && (
          <Button
            size="sm"
            variant="secondary"
            icon={Wand2}
            onClick={async () => {
              const n = await applyAutoZoom(clip, asset, scale);
              toast(
                n
                  ? `${n} zoom(s) automático(s) nos cliques.`
                  : "Nenhum clique neste trecho da gravação.",
                n ? "success" : "info",
              );
            }}
          >
            Zoom automático nos cliques
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          icon={Plus}
          disabled={time < clip.start || time >= clipEnd(clip)}
          onClick={() => void addHere()}
        >
          Zoom aqui
        </Button>
      </div>
      {zooms.length > 0 && (
        <ul className="zoom-list">
          {zooms.map((z) => (
            <li key={z.id}>
              <button
                type="button"
                className="zoom-go"
                onClick={() => playback.seek(Math.max(clip.start, toTimeline(z.start) + 0.8))}
                title="Ir até este zoom"
              >
                <Crosshair size={12} />
                <span className="mono">
                  {clock(Math.max(clip.start, toTimeline(z.start)))}–
                  {clock(Math.min(clipEnd(clip), toTimeline(z.end)))}
                </span>
                <span className="muted">
                  {Math.round(z.scale * 100)}%{z.auto ? " · auto" : ""}
                </span>
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Tirar este zoom"
                onClick={() => updateZooms(clip, (old) => old.filter((x) => x.id !== z.id))}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!asset.cursor && (
        <p className="props-hint muted">
          Gravações feitas no EdiAula guardam os cliques e ganham zoom automático.
        </p>
      )}
    </div>
  );
}
