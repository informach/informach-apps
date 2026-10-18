import {
  CURSOR_EFFECT_DEFAULTS,
  CURSOR_RANGE_KEYS,
  type CursorFx,
  type CursorPointer,
  type CursorRange,
  type CursorRangeFx,
  type CursorRangeKey,
  DEFAULT_CURSOR_FX,
  editedCursorAt,
} from "@shared/cursor";
import type { CursorData } from "@shared/cursorData";
import { plural } from "@shared/plural";
import { clipEnd, newId, sourceAt, sourceEnd, timelineAt } from "@shared/timeline";
import type { Asset, Clip } from "@shared/types";
import {
  autoZooms,
  DEFAULT_AUTO_ZOOM,
  editZoomsIn,
  focusIndexAt,
  removeZoom,
  sceneZooms,
  setZoomFocus,
  updateZoom,
  ZOOM_EASE,
  type Zoom,
  zoomsIn,
} from "@shared/zoom";
import { Crosshair, MousePointer2, Plus, ScanSearch, Trash2, Wand2, X, ZoomIn } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { type Commit, personCommit } from "@/state/project";
import { Button, Toggle } from "@/ui";
import { Slider } from "./ClipVisual";
import { cursorFxOf, loadCursorData } from "./CursorLayer";
import { FavoriteStyle } from "./LookSections";
import { Swatches } from "./Swatches";
import { ZoomPointControls } from "./ZoomLayerPanel";

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

export function setCursorFx(
  assetId: string,
  changes: Partial<CursorFx>,
  commit: Commit = personCommit,
): void {
  commit((p) => ({
    ...p,
    assets: p.assets.map((a) =>
      a.id === assetId
        ? { ...a, cursorFx: { ...DEFAULT_CURSOR_FX, ...a.cursorFx, ...changes } }
        : a,
    ),
  }));
}

const POINTERS: [CursorPointer, string, string][] = [
  [
    "auto",
    "Automático",
    "O desenho do EdiAula nos formatos comuns e a imagem real nos cursores próprios dos programas",
  ],
  ["vector", "Desenhado", "Sempre o desenho do EdiAula, nítido em qualquer tamanho"],
  ["real", "Do sistema", "A imagem que o Windows mostrou, onde ela foi guardada"],
];

const RANGE_LABELS: Record<CursorRangeKey, string> = {
  halo: "Halo",
  clicks: "Onda",
  magnifier: "Lupa",
  spotlight: "Holofote",
  clickSound: "Som",
  hidden: "Esconder",
};

/** How the recorded pointer is drawn (applies to every clip of the recording). */
export function CursorSection({ asset, clip }: { asset: Asset; clip: Clip }): ReactNode {
  const fx = cursorFxOf(asset);
  const set = (c: Partial<CursorFx>): void => {
    setCursorFx(asset.id, c);
  };
  const percent = (v: number): string => `${Math.round(v * 100)}%`;
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
          <span className="field-label">Desenho do ponteiro</span>
          <div className="chip-row">
            {POINTERS.map(([id, label, title]) => (
              <button
                type="button"
                key={id}
                title={title}
                className={`chip ${(fx.pointer ?? "auto") === id ? "is-active" : ""}`}
                onClick={() => set({ pointer: id })}
              >
                {label}
              </button>
            ))}
          </div>
          <ToggleRow label="Onda nos cliques" on={fx.clicks} onChange={(v) => set({ clicks: v })} />
          <ToggleRow label="Halo" on={fx.halo} onChange={(v) => set({ halo: v })} />
          {fx.halo && (
            <Swatches
              value={fx.haloColor ?? CURSOR_EFFECT_DEFAULTS.haloColor}
              extra={[{ hex: CURSOR_EFFECT_DEFAULTS.haloColor, name: "Amarelo" }]}
              onPick={(hex) => set({ haloColor: hex ?? CURSOR_EFFECT_DEFAULTS.haloColor })}
            />
          )}
          <ToggleRow
            label="Lupa em volta do cursor"
            on={!!fx.magnifier}
            onChange={(v) => set({ magnifier: v })}
          />
          {fx.magnifier && (
            <>
              <Slider
                label="Raio"
                value={fx.magnifierRadius ?? CURSOR_EFFECT_DEFAULTS.magnifierRadius}
                min={0.05}
                max={0.35}
                step={0.01}
                format={percent}
                onCommit={(v) => set({ magnifierRadius: v })}
              />
              <Slider
                label="Aumento"
                value={fx.magnifierZoom ?? CURSOR_EFFECT_DEFAULTS.magnifierZoom}
                min={1.25}
                max={4}
                step={0.05}
                format={(v) => `${v.toFixed(2)}×`}
                onCommit={(v) => set({ magnifierZoom: v })}
              />
            </>
          )}
          <ToggleRow
            label="Holofote (escurece o resto da tela)"
            on={!!fx.spotlight}
            onChange={(v) => set({ spotlight: v })}
          />
          {fx.spotlight && (
            <>
              <Slider
                label="Raio"
                value={fx.spotlightRadius ?? CURSOR_EFFECT_DEFAULTS.spotlightRadius}
                min={0.06}
                max={0.6}
                step={0.01}
                format={percent}
                onCommit={(v) => set({ spotlightRadius: v })}
              />
              <Slider
                label="Escurecer"
                value={fx.spotlightDim ?? CURSOR_EFFECT_DEFAULTS.spotlightDim}
                min={0.1}
                max={0.9}
                step={0.05}
                format={percent}
                onCommit={(v) => set({ spotlightDim: v })}
              />
            </>
          )}
          <ToggleRow
            label="Som de clique"
            on={!!fx.clickSound}
            onChange={(v) => set({ clickSound: v })}
          />
          {fx.clickSound && (
            <Slider
              label="Volume"
              value={fx.clickVolume ?? CURSOR_EFFECT_DEFAULTS.clickVolume}
              min={0.05}
              max={1}
              step={0.05}
              format={percent}
              onCommit={(v) => set({ clickVolume: v })}
            />
          )}
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
          <FavoriteStyle
            target="cursor"
            name="Cursor"
            value={() => {
              const { path: _path, pathEdits: _edits, ...look } = fx;
              return look;
            }}
          />
          <CursorRanges asset={asset} clip={clip} fx={fx} />
        </>
      )}
    </div>
  );
}

/**
 * Effects for a stretch of the recording: each one the same, on or off there. They show as
 * violet bands on the recording's clips in the timeline, where their edges can be dragged.
 */
function CursorRanges({ asset, clip, fx }: { asset: Asset; clip: Clip; fx: CursorFx }): ReactNode {
  const time = usePlayback((s) => s.time);
  const selected = useApp((s) => s.cursorRange);
  const all = fx.ranges ?? [];
  const ranges = all.filter((r) => r.end > clip.in && r.start < sourceEnd(clip));
  const write = (next: CursorRange[]): void => {
    setCursorFx(asset.id, { ranges: next.length ? next : undefined });
  };
  const add = (): void => {
    const at = sourceAt(clip, Math.max(clip.start, Math.min(clipEnd(clip) - 0.1, time)));
    const range: CursorRange = {
      id: `r${Date.now().toString(36)}`,
      start: Math.max(clip.in, at),
      end: Math.min(sourceEnd(clip), at + 4),
      fx: { magnifier: true },
    };
    if (range.end - range.start < 0.2) return;
    write([...all, range]);
    useApp.getState().set({ cursorRange: range.id });
  };
  const change = (id: string, key: CursorRangeKey, value: string): void =>
    write(
      all.map((r) => {
        if (r.id !== id) return r;
        const rest: CursorRangeFx = { ...r.fx };
        delete rest[key];
        return { ...r, fx: value === "same" ? rest : { ...rest, [key]: value === "on" } };
      }),
    );
  return (
    <div className="cursor-ranges">
      <div className="props-head">
        <span className="field-label">Efeito por trecho</span>
        <Button size="sm" variant="ghost" icon={Plus} onClick={add}>
          Trecho aqui
        </Button>
      </div>
      {ranges.length === 0 ? (
        <p className="props-hint muted">
          Liga ou desliga a lupa, o holofote, o som e os outros efeitos só num pedaço da gravação. O
          trecho aparece em roxo na faixa da gravação, e as bordas dele se arrastam ali.
        </p>
      ) : (
        <ul className="cursor-range-list">
          {ranges.map((r) => (
            <li key={r.id} className={selected === r.id ? "is-selected" : undefined}>
              <div className="cursor-range-head">
                <button
                  type="button"
                  className="zoom-go"
                  onClick={() => {
                    useApp.getState().set({ cursorRange: r.id });
                    playback.seek(Math.max(clip.start, timelineAt(clip, r.start) + 0.05));
                  }}
                  title="Ir até este trecho"
                >
                  <Crosshair size={12} />
                  <span className="mono">
                    {clock(Math.max(clip.start, timelineAt(clip, r.start)))} a{" "}
                    {clock(Math.min(clipEnd(clip), timelineAt(clip, r.end)))}
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Tirar este trecho"
                  onClick={() => write(all.filter((x) => x.id !== r.id))}
                >
                  <X size={12} />
                </button>
              </div>
              <div className="cursor-range-grid">
                {CURSOR_RANGE_KEYS.map((key) => (
                  <label key={key}>
                    <span>{RANGE_LABELS[key]}</span>
                    <select
                      className="select"
                      value={r.fx[key] === undefined ? "same" : r.fx[key] ? "on" : "off"}
                      onChange={(e) => change(r.id, key, e.target.value)}
                    >
                      <option value="same">Como no resto</option>
                      <option value="on">Ligado</option>
                      <option value="off">Desligado</option>
                    </select>
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
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
function updateZooms(clip: Clip, fn: (z: Zoom[]) => Zoom[], commit: Commit = personCommit): void {
  commit((p) => ({
    ...p,
    assets: p.assets.map((a) => {
      if (a.id !== clip.assetId) return a;
      const { zooms: old, ...rest } = a;
      const zooms = editZoomsIn(old, clip.in, sourceEnd(clip), fn);
      return zooms ? { ...rest, zooms } : rest;
    }),
  }));
}

/** Writes a recording's whole list of zooms (one Ctrl+Z). */
export function setAssetZooms(
  assetId: string,
  fn: (zooms: Zoom[] | undefined) => Zoom[] | undefined,
  commit: Commit = personCommit,
): void {
  commit((p) => ({
    ...p,
    assets: p.assets.map((a) => {
      if (a.id !== assetId) return a;
      const { zooms: old, ...rest } = a;
      const zooms = fn(old);
      return zooms?.length ? { ...rest, zooms } : rest;
    }),
  }));
}

/** The cursor data with the pointer where the edited path puts it (clicks included). */
async function zoomData(asset: Asset): Promise<CursorData | null> {
  if (!asset.cursor) return null;
  const data = await loadCursorData(asset.cursor);
  const fx = cursorFxOf(asset);
  return {
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
}

/** Generates zooms on the clicks and typing of a recording (replacing earlier automatic ones). Returns how many. */
export async function applyAutoZoom(
  clip: Clip,
  asset: Asset,
  scale = DEFAULT_AUTO_ZOOM.scale,
  commit: Commit = personCommit,
): Promise<number> {
  const data = await zoomData(asset);
  if (!data) return 0;
  const zooms = autoZooms(data, asset.duration, { ...DEFAULT_AUTO_ZOOM, scale }).filter(
    (z) => z.end > clip.in && z.start < sourceEnd(clip),
  );
  updateZooms(clip, (old) => [...old.filter((z) => !z.auto), ...zooms], commit);
  return zooms.length;
}

/**
 * The automatic zoom of a whole recording that just came in (lib/recording.ts): only when it
 * has none yet, so a take recorded again never loses the zooms made by hand. Returns how many.
 */
export async function autoZoomRecording(
  asset: Asset,
  exclude: readonly [number, number][] = [],
  commit: Commit = personCommit,
): Promise<number> {
  if (asset.zooms?.length) return 0;
  const data = await zoomData(asset);
  if (!data) return 0;
  const zooms = autoZooms(data, asset.duration, { ...DEFAULT_AUTO_ZOOM, exclude });
  if (zooms.length) setAssetZooms(asset.id, () => zooms, commit);
  return zooms.length;
}

const sameClock = (a: number, b: number): boolean => Math.abs(a - b) < 1e-3;

export function ZoomSection({ clip, asset }: { clip: Clip; asset: Asset }): ReactNode {
  const zooms = zoomsIn(asset.zooms, clip.in, sourceEnd(clip));
  const [scale, setScale] = useState(zooms.find((z) => z.auto)?.scale ?? DEFAULT_AUTO_ZOOM.scale);
  const [proposals, setProposals] = useState<Zoom[] | null>(null);
  const [looking, setLooking] = useState(false);
  const time = usePlayback((s) => s.time);
  const editing = useApp((s) => s.recordingZoom);
  const toTimeline = (src: number): number => timelineAt(clip, src);
  const toast = useApp((s) => s.toast);
  const select = (z: Zoom): void => {
    useApp.getState().set({ recordingZoom: { assetId: asset.id, zoomId: z.id } });
    playback.seek(Math.min(clipEnd(clip) - 0.01, Math.max(clip.start, toTimeline(z.start) + 0.8)));
  };

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
    useApp.getState().set({ recordingZoom: { assetId: asset.id, zoomId: z.id } });
  };

  /** Where the screen changes a lot (the proxy, when it is ready), as zooms to accept. */
  const lookForScenes = async (): Promise<void> => {
    setLooking(true);
    const jobId = newId("job");
    const { startJob, endJob } = useApp.getState();
    startJob(jobId, `Procurando mudanças de tela: ${asset.name}`);
    try {
      const input = asset.proxyStatus === "ready" && asset.proxy ? asset.proxy : asset.path;
      const changes = await window.api.scenes(jobId, asset.path, input, asset.duration);
      const data = asset.cursor ? await loadCursorData(asset.cursor) : null;
      const found = sceneZooms(changes, data, asset.duration, asset.zooms ?? []).filter(
        (z) => z.end > clip.in && z.start < sourceEnd(clip),
      );
      setProposals(found);
      if (!found.length) toast("Nenhuma mudança grande de tela neste trecho.", "info");
    } catch (error) {
      toast(`Não consegui procurar as mudanças de tela: ${(error as Error).message}`, "error");
    } finally {
      endJob(jobId);
      setLooking(false);
    }
  };
  const accept = (list: Zoom[]): void => {
    updateZooms(clip, (old) => [...old, ...list]);
    setProposals((current) => current?.filter((z) => !list.includes(z)) ?? null);
  };

  const selected =
    editing?.assetId === asset.id ? zooms.find((z) => z.id === editing.zoomId) : undefined;
  return (
    <div className="props-section">
      <div className="props-head">
        <h3>
          <ZoomIn size={13} /> Zoom
        </h3>
        {zooms.length > 0 && (
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              updateZooms(clip, () => []);
              useApp.getState().set({ recordingZoom: null });
            }}
          >
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
      <div className="row-6 wrap">
        {asset.cursor && (
          <Button
            size="sm"
            variant="secondary"
            icon={Wand2}
            onClick={async () => {
              const n = await applyAutoZoom(clip, asset, scale);
              toast(
                n
                  ? `${plural(n, "zoom automático", "zooms automáticos")} nos cliques e na digitação.`
                  : "Nenhum clique nem digitação neste trecho da gravação.",
                n ? "success" : "info",
              );
            }}
          >
            Zoom automático
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
        <Button
          size="sm"
          variant="ghost"
          icon={ScanSearch}
          disabled={looking}
          onClick={() => void lookForScenes()}
          title="Procura no vídeo as telas que mudam muito e propõe um zoom logo depois de cada uma"
        >
          Sugerir pelas mudanças de tela
        </Button>
      </div>
      {proposals && proposals.length > 0 && (
        <div className="zoom-proposals">
          <span className="field-label">
            {plural(proposals.length, "sugestão de zoom", "sugestões de zoom")}
          </span>
          <ul className="zoom-list">
            {proposals.map((z) => (
              <li key={z.id}>
                <button
                  type="button"
                  className="zoom-go"
                  onClick={() => playback.seek(Math.max(clip.start, toTimeline(z.start)))}
                  title="Ir até esta mudança de tela"
                >
                  <Crosshair size={12} />
                  <span className="mono">{clock(Math.max(clip.start, toTimeline(z.start)))}</span>
                </button>
                <button type="button" className="link-btn" onClick={() => accept([z])}>
                  Aplicar
                </button>
              </li>
            ))}
          </ul>
          <div className="row-6">
            <Button size="sm" variant="secondary" onClick={() => accept(proposals)}>
              Aplicar todas
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setProposals(null)}>
              Descartar
            </Button>
          </div>
        </div>
      )}
      {zooms.length > 0 && (
        <ul className="zoom-list">
          {zooms.map((z) => (
            <li key={z.id} className={selected?.id === z.id ? "is-selected" : undefined}>
              <button
                type="button"
                className="zoom-go"
                onClick={() => select(z)}
                title="Editar este zoom (no vídeo, arraste o retângulo)"
              >
                <Crosshair size={12} />
                <span className="mono">
                  {clock(Math.max(clip.start, toTimeline(z.start)))} a{" "}
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
                onClick={() => {
                  updateZooms(clip, (old) => old.filter((x) => x.id !== z.id));
                  if (selected?.id === z.id) useApp.getState().set({ recordingZoom: null });
                }}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && <RecordingZoomControls clip={clip} asset={asset} zoom={selected} />}
      {!asset.cursor && (
        <p className="props-hint muted">
          Gravações feitas no EdiAula guardam os cliques e a digitação e ganham zoom automático.
        </p>
      )}
    </div>
  );
}

/**
 * One zoom of the recording, with the zoom layer's own controls: how close, where (the same
 * rectangle in the preview, for the focus point in force at the playhead) and how smoothly it
 * goes in and out. Its edges are dragged on the amber band in the timeline.
 */
function RecordingZoomControls({
  clip,
  asset,
  zoom,
}: {
  clip: Clip;
  asset: Asset;
  zoom: Zoom;
}): ReactNode {
  const time = usePlayback((s) => s.time);
  const src = sourceAt(clip, Math.max(clip.start, Math.min(clipEnd(clip), time)));
  const point = zoom.focus[focusIndexAt(zoom, src)] ?? { x: 0.5, y: 0.5 };
  return (
    <div className="recording-zoom">
      <div className="props-head">
        <span className="field-label">
          Zoom de {clock(timelineAt(clip, zoom.start))} a {clock(timelineAt(clip, zoom.end))}
        </span>
        <button
          type="button"
          className="link-btn"
          title="Apagar este zoom"
          onClick={() => {
            setAssetZooms(asset.id, (zooms) => removeZoom(zooms, zoom.id));
            useApp.getState().set({ recordingZoom: null });
          }}
        >
          <Trash2 size={12} /> Apagar
        </button>
      </div>
      <p className="props-hint muted">
        No vídeo, arraste o retângulo para escolher o que aproxima; a rodinha do mouse muda o
        quanto. Na timeline, arraste as pontas da faixa âmbar para mudar quando começa e termina.
        {zoom.focus.length > 1
          ? ` Ele passa por ${plural(zoom.focus.length, "ponto", "pontos")}: o retângulo muda o ponto da posição atual.`
          : ""}
      </p>
      <ZoomPointControls
        scale={zoom.scale}
        x={point.x}
        y={point.y}
        min={1.05}
        onChange={(change) =>
          setAssetZooms(asset.id, (zooms) => {
            let next = zooms;
            if (change.scale !== undefined)
              next = updateZoom(next, zoom.id, { scale: change.scale });
            if (change.x !== undefined || change.y !== undefined)
              next = setZoomFocus(next, zoom.id, src, change.x ?? point.x, change.y ?? point.y);
            return next;
          })
        }
      />
      <Slider
        label="Suavidade"
        value={zoom.ease ?? ZOOM_EASE}
        min={0.1}
        max={3}
        step={0.05}
        format={(v) => `${v.toFixed(2)} s`}
        onCommit={(ease) =>
          setAssetZooms(asset.id, (zooms) => updateZoom(zooms, zoom.id, { ease }))
        }
      />
      {!sameClock(zoom.start, Math.max(zoom.start, clip.in)) && (
        <p className="props-hint muted">Este zoom começa antes deste clipe.</p>
      )}
    </div>
  );
}
