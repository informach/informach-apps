import {
  buildTrack,
  type CursorPoint,
  cursorAt,
  cursorControls,
  cursorPathGeometry,
  editedCursorAt,
  insertCursorPoint,
  nearestCursorTime,
  normalizeCursorPath,
  recordedCursorPath,
} from "@shared/cursor";
import type { CursorData } from "@shared/recording";
import { clipSpeed, sourceAt, sourceEnd } from "@shared/timeline";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { mediaUrl, playbackPath } from "@/lib/media";
import { useApp } from "@/state/app";
import { usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { Button, Modal } from "@/ui";
import { cursorFxOf, loadCursorData } from "./CursorLayer";
import { setCursorFx } from "./RecordingProps";

export function CursorPathDialog(): ReactNode {
  const id = useApp((s) => s.cursorClip);
  const project = useProject((s) => s.project);
  const clip = project?.clips.find((c) => c.id === id);
  const asset = project?.assets.find((a) => a.id === clip?.assetId);
  const [data, setData] = useState<CursorData | null>(null);
  const [error, setError] = useState("");
  const [points, setPoints] = useState<CursorPoint[]>(
    () => asset?.cursorFx?.path?.map((p) => ({ ...p })) ?? [],
  );
  const [selected, setSelected] = useState(-1);
  const [changed, setChanged] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const originalPoints = useRef<CursorPoint[]>([]);
  const [time, setTime] = useState(() =>
    clip && asset
      ? Math.max(
          clip.in,
          Math.min(asset.duration, sourceEnd(clip), sourceAt(clip, usePlayback.getState().time)),
        )
      : 0,
  );
  const video = useRef<HTMLVideoElement>(null);
  const drag = useRef<{ index: number; handle?: "inHandle" | "outHandle" } | null>(null);
  const close = (): void => {
    useApp.getState().set({ cursorClip: null });
  };
  const selectInitialPoint = useEffectEvent((initial: CursorPoint[]) => {
    setSelected(
      initial.reduce(
        (best, point, index) =>
          Math.abs(point.t - time) < Math.abs(initial[best].t - time) ? index : best,
        0,
      ),
    );
  });
  useEffect(() => {
    let active = true;
    if (asset?.cursor && clip)
      void loadCursorData(asset.cursor)
        .then((d) => {
          if (!active) return;
          const recorded = buildTrack(
            d,
            { ...cursorFxOf(asset), path: undefined, pathEdits: undefined },
            asset.duration,
          );
          const generated = normalizeCursorPath(
            recordedCursorPath(recorded, clip.in, sourceEnd(clip)),
            d.width,
            d.height,
            asset.duration,
          );
          originalPoints.current = generated;
          const end = Math.min(asset.duration, sourceEnd(clip));
          const edits = asset.cursorFx?.pathEdits ?? [];
          const latest = [...edits].reverse().find((e) => e.start <= end && e.end >= clip.in);
          const exact = latest?.start === clip.in && latest.end === end ? latest : undefined;
          const saved = exact ? exact.points : edits.length ? undefined : asset.cursorFx?.path;
          const initial =
            saved?.length && saved[0].t >= clip.in && saved[saved.length - 1].t <= end
              ? structuredClone(saved)
              : recordedCursorPath(buildTrack(d, cursorFxOf(asset), asset.duration), clip.in, end);
          setPoints(initial);
          selectInitialPoint(initial);
          setData(d);
        })
        .catch((e: Error) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [asset, clip]);
  useEffect(() => {
    if (video.current)
      video.current.currentTime = Math.min(time, Math.max(0, (asset?.duration ?? 0) - 0.001));
  }, [time, asset?.duration]);
  const path = useMemo(
    () =>
      data && asset ? normalizeCursorPath(points, data.width, data.height, asset.duration) : [],
    [points, data, asset],
  );
  const track = useMemo(
    () =>
      data && asset
        ? buildTrack(
            data,
            restoring
              ? { ...cursorFxOf(asset), path: undefined, pathEdits: undefined }
              : cursorFxOf(asset),
            asset.duration,
          )
        : null,
    [data, asset, restoring],
  );
  const locked =
    project?.clips.some(
      (c) => c.assetId === asset?.id && project.tracks.find((t) => t.id === c.trackId)?.locked,
    ) ?? true;
  const hasPoint = !!points[selected];
  const remove = useCallback((): void => {
    if (!hasPoint || locked) return;
    setChanged(true);
    setRestoring(false);
    setPoints((old) => old.filter((_, i) => i !== selected));
    setSelected(-1);
    drag.current = null;
  }, [hasPoint, locked, selected]);
  useEffect(() => {
    if (!asset || !clip) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (
        target?.closest(
          'textarea, input:not([type="range"]):not([type="button"]):not([type="checkbox"]), [contenteditable]:not([contenteditable="false"])',
        )
      )
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) remove();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [asset, clip, remove]);
  if (!asset || !clip || !project) return null;
  const end = Math.min(asset.duration, sourceEnd(clip));
  const speed = clipSpeed(clip);
  const localDuration = (end - clip.in) / speed;
  const localTime = (source: number): number => (source - clip.in) / speed;
  const current =
    (changed && !restoring
      ? editedCursorAt(
          { ...cursorFxOf(asset), pathEdits: [{ start: clip.in, end, points: path }] },
          time,
        )
      : null) ?? (track ? cursorAt(track, time) : null);
  const point = points[selected];
  const pointIndex = point ? path.findIndex((p) => p.t === point.t) : -1;
  const handles: { key: "inHandle" | "outHandle"; x: number; y: number }[] = [];
  if (pointIndex > 0)
    handles.push({ key: "inHandle", ...cursorControls(path[pointIndex - 1], path[pointIndex])[1] });
  if (pointIndex >= 0 && pointIndex < path.length - 1)
    handles.push({
      key: "outHandle",
      ...cursorControls(path[pointIndex], path[pointIndex + 1])[0],
    });
  const update = (i: number, change: Partial<CursorPoint>): void => {
    setChanged(true);
    setRestoring(false);
    setPoints((old) => old.map((p, index) => (index === i ? { ...p, ...change } : p)));
  };
  const add = (x: number, y: number): number => {
    setChanged(true);
    setRestoring(false);
    const existing = points.findIndex((p) => Math.abs(p.t - time) < 0.001);
    const index = existing < 0 ? points.length : existing;
    if (existing < 0) setPoints((old) => [...old, { t: time, x, y }]);
    else update(existing, { x, y });
    setSelected(index);
    return index;
  };
  const insert = (t: number): void => {
    if (locked) return;
    const next = insertCursorPoint(path, t);
    const index = next.findIndex((p) => Math.abs(p.t - t) < 0.001);
    if (index < 0) return;
    if (next !== path) {
      setChanged(true);
      setRestoring(false);
    }
    setPoints(next);
    setSelected(index);
    setTime(next[index].t);
  };
  return (
    <Modal label="Editar caminho do cursor" onClose={close} width={840}>
      <div
        className="modal-body"
        style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}
      >
        <h2 className="modal-title">Editar caminho do cursor</h2>
        <p className="muted">
          Dê dois cliques na linha verde para adicionar um ponto naquele trecho do caminho.
          Selecione um ponto e pressione Delete para removê-lo. Arraste os pontos e as alças azuis
          para ajustar a curva.
        </p>
        {error && <p role="alert">Não foi possível carregar o cursor: {error}</p>}
        {!data && !error && <p>Carregando caminho…</p>}
        {data && (
          <>
            <div
              role="application"
              aria-label="Edição do caminho do cursor"
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: `${data.width}/${data.height}`,
                background: "#000",
                flexShrink: 0,
              }}
            >
              <video
                ref={video}
                src={mediaUrl(playbackPath(asset))}
                muted
                preload="auto"
                onLoadedMetadata={() => {
                  if (video.current) video.current.currentTime = time;
                }}
                style={{ width: "100%", height: "100%", display: "block" }}
              />
              <svg
                viewBox={`0 0 ${data.width} ${data.height}`}
                aria-label="Caminho do cursor: dois cliques para adicionar, Delete para remover"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  touchAction: "none",
                  cursor: "crosshair",
                }}
                onDoubleClick={(e) => {
                  if (!(e.target as Element).hasAttribute("data-path")) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  const t = nearestCursorTime(
                    path,
                    ((e.clientX - r.left) / r.width) * data.width,
                    ((e.clientY - r.top) / r.height) * data.height,
                  );
                  if (t !== null) insert(t);
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0 || locked) return;
                  e.currentTarget.focus();
                  if ((e.target as Element).hasAttribute("data-path")) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = Math.max(
                    0,
                    Math.min(data.width, ((e.clientX - rect.left) / rect.width) * data.width),
                  );
                  const y = Math.max(
                    0,
                    Math.min(data.height, ((e.clientY - rect.top) / rect.height) * data.height),
                  );
                  const index = Number((e.target as Element).getAttribute("data-point") ?? -1);
                  const handle = (e.target as Element).getAttribute("data-handle");
                  if (index >= 0) {
                    setSelected(index);
                    setTime(points[index].t);
                    drag.current = {
                      index,
                      ...(handle === "inHandle" || handle === "outHandle" ? { handle } : {}),
                    };
                  } else drag.current = { index: add(x, y) };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (drag.current === null) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  const x = Math.max(
                    0,
                    Math.min(data.width, ((e.clientX - r.left) / r.width) * data.width),
                  );
                  const y = Math.max(
                    0,
                    Math.min(data.height, ((e.clientY - r.top) / r.height) * data.height),
                  );
                  const { index, handle } = drag.current;
                  const anchor = points[index];
                  if (handle) update(index, { [handle]: { x: x - anchor.x, y: y - anchor.y } });
                  else update(index, { x, y });
                }}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
              >
                <path
                  d={cursorPathGeometry(path)}
                  fill="none"
                  stroke="#111111"
                  strokeWidth={data.width / 250}
                  pointerEvents="none"
                />
                <path
                  d={cursorPathGeometry(path)}
                  fill="none"
                  stroke="#c8f031"
                  strokeWidth={data.width / 500}
                  pointerEvents="none"
                />
                <path
                  data-path="true"
                  d={cursorPathGeometry(path)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={data.width / 55}
                  pointerEvents="stroke"
                  style={{ cursor: "copy" }}
                />
                {point &&
                  handles.map((h) => (
                    <g key={h.key}>
                      <line
                        x1={point.x}
                        y1={point.y}
                        x2={h.x}
                        y2={h.y}
                        stroke="#56bdff"
                        strokeWidth={data.width / 600}
                        pointerEvents="none"
                      />
                      <circle
                        data-point={selected}
                        data-handle={h.key}
                        cx={h.x}
                        cy={h.y}
                        r={data.width / 100}
                        fill="#56bdff"
                        stroke="#111111"
                        strokeWidth={data.width / 600}
                        style={{ cursor: "grab" }}
                      >
                        <title>{h.key === "inHandle" ? "Alça de entrada" : "Alça de saída"}</title>
                      </circle>
                    </g>
                  ))}
                {points.map((p, i) => (
                  <circle
                    key={p.t}
                    data-point={i}
                    cx={p.x}
                    cy={p.y}
                    r={data.width / 90}
                    fill={i === selected ? "#ffffff" : "#c8f031"}
                    stroke="#111111"
                    strokeWidth={data.width / 600}
                  />
                ))}
                {current && (
                  <circle
                    cx={current.x}
                    cy={current.y}
                    r={data.width / 150}
                    fill="#ff9459"
                    stroke="#111"
                    strokeWidth={data.width / 700}
                    pointerEvents="none"
                  />
                )}
              </svg>
            </div>
            <label>
              Tempo no intervalo: {localTime(time).toFixed(3)} / {localDuration.toFixed(3)} s
              <input
                className="range"
                style={{ width: "100%" }}
                aria-label="Tempo do cursor no intervalo"
                type="range"
                min={0}
                max={localDuration}
                step={1 / (project.settings.fps || 30)}
                value={localTime(time)}
                onChange={(e) => setTime(Math.min(end, clip.in + Number(e.target.value) * speed))}
              />
            </label>
            <div className="row-6 row-wrap">
              <Button
                size="sm"
                disabled={locked}
                onClick={() => {
                  if (path.length > 1 && time >= path[0].t && time <= path[path.length - 1].t)
                    insert(time);
                  else if (current) add(current.x, current.y);
                }}
              >
                Adicionar ponto neste tempo
              </Button>
              <Button size="sm" disabled={!point || locked} onClick={remove}>
                Remover ponto (Delete)
              </Button>
              <Button
                size="sm"
                disabled={!points.length}
                onClick={() => {
                  setPoints(structuredClone(originalPoints.current));
                  setSelected(0);
                  setChanged(true);
                  setRestoring(true);
                }}
              >
                Restaurar caminho original
              </Button>
            </div>
            <label>
              Ponto selecionado
              <select
                className="input"
                value={selected}
                onChange={(e) => {
                  const i = Number(e.target.value);
                  setSelected(i);
                  if (points[i]) setTime(points[i].t);
                }}
              >
                <option value={-1}>Selecione um ponto</option>
                {points.map((p, i) => (
                  <option key={p.t} value={i}>
                    Ponto {i + 1} · {localTime(p.t).toFixed(3)} s
                  </option>
                ))}
              </select>
            </label>
            {point && (
              <div className="row-6 row-wrap">
                {(["t", "x", "y"] as const).map((key) => (
                  <label key={key} style={{ flex: 1 }}>
                    {key === "t" ? "Tempo (s)" : `${key.toUpperCase()} (pixels)`}
                    <input
                      className="input"
                      aria-label={key === "t" ? "Tempo do ponto" : `Posição ${key.toUpperCase()}`}
                      type="number"
                      min={0}
                      max={key === "t" ? localDuration : key === "x" ? data.width : data.height}
                      step={key === "t" ? 0.001 : 1}
                      value={Number((key === "t" ? localTime(point.t) : point[key]).toFixed(3))}
                      onChange={(e) => {
                        const value = e.target.valueAsNumber;
                        if (!Number.isFinite(value)) return;
                        const limited = Math.max(
                          0,
                          Math.min(
                            key === "t" ? localDuration : key === "x" ? data.width : data.height,
                            value,
                          ),
                        );
                        const n = key === "t" ? Math.min(end, clip.in + limited * speed) : limited;
                        update(selected, { [key]: n });
                        if (key === "t") setTime(n);
                      }}
                    />
                  </label>
                ))}
                <Button
                  size="sm"
                  onClick={() => update(selected, { inHandle: undefined, outHandle: undefined })}
                >
                  Redefinir alças
                </Button>
              </div>
            )}
            <p className="muted">
              O tempo começa em zero neste clipe. O caminho mostra somente este intervalo,
              respeitando sua velocidade. A edição afeta este intervalo da gravação, inclusive suas
              outras cópias na aula. Zooms automáticos já criados precisam ser gerados novamente.
            </p>
            {points.length === 1 && (
              <p role="alert">Adicione pelo menos dois pontos para definir um trajeto.</p>
            )}
            {locked && (
              <p role="alert">Destrave as faixas que usam esta gravação para editar seu cursor.</p>
            )}
          </>
        )}
        <div className="modal-actions">
          <Button onClick={close}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={!data || locked || path.length === 1}
            onClick={() => {
              if (changed)
                setCursorFx(asset.id, {
                  pathEdits: [
                    ...(asset.cursorFx?.pathEdits ?? []).filter(
                      (e) => e.start !== clip.in || e.end !== end,
                    ),
                    { start: clip.in, end, points: restoring ? [] : path },
                  ],
                });
              close();
            }}
          >
            Aplicar caminho
          </Button>
        </div>
      </div>
    </Modal>
  );
}
