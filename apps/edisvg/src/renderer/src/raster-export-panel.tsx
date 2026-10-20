import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Project } from "../../shared/project";
import {
  inspectRasterExport,
  RASTER_LIMITS,
  type RasterFormat,
  type RasterOptionsInput,
  rasterHeightFor,
} from "../../shared/raster/profile";
import { videoSupport } from "./raster/rasterExport";

export interface RasterSettings {
  options: RasterOptionsInput;
  ready: boolean;
}
interface Props {
  project: Project;
  artboardId: string;
  animationId: string;
  format: RasterFormat | null;
  onChange: (settings: RasterSettings) => void;
}
const FPS_CHOICES = [12, 15, 24, 25, 30, 50, 60];
const isVideo = (format: RasterFormat | null) => format === "mp4" || format === "webm";
const even = (value: number) => value + (value % 2);

function RasterExportPanel({ project, artboardId, animationId, format, onChange }: Props) {
  const board = project.artboards.find((value) => value.id === artboardId),
    clip = project.motion.animations.find((value) => value.id === animationId),
    viewBox = board?.scene.viewBox ?? [0, 0, 1080, 1080],
    initialWidth = Math.min(1920, Math.max(RASTER_LIMITS.minSide, Math.round(viewBox[2] ?? 1080)));
  const [width, setWidth] = useState(initialWidth),
    [height, setHeight] = useState(() => rasterHeightFor(viewBox, initialWidth, false)),
    [keepRatio, setKeepRatio] = useState(true),
    [fps, setFps] = useState(() =>
      Math.min(clip?.fps ?? 30, format === "gif" ? RASTER_LIMITS.gifMaxFps : RASTER_LIMITS.maxFps),
    ),
    [transparent, setTransparent] = useState(true),
    [color, setColor] = useState("#ffffff"),
    [quality, setQuality] = useState<"standard" | "high">("standard"),
    [confirmRaster, setConfirmRaster] = useState(false),
    [confirmAnimationOnly, setConfirmAnimationOnly] = useState(false),
    [confirmPalette, setConfirmPalette] = useState(false),
    [codec, setCodec] = useState<{ key: string; supported: boolean; reason: string } | null>(null);
  const video = isVideo(format),
    outputWidth = video ? even(width) : width,
    outputHeight = video ? even(height) : height,
    outputFps = fps;
  const options = useMemo<RasterOptionsInput | null>(
    () =>
      format
        ? {
            format,
            artboardId,
            animationId,
            width: outputWidth,
            height: outputHeight,
            fps: outputFps,
            background: video || !transparent ? color : "transparent",
            quality,
            confirmRaster,
            confirmAnimationOnly,
            confirmPalette,
          }
        : null,
    [
      format,
      artboardId,
      animationId,
      outputWidth,
      outputHeight,
      outputFps,
      video,
      transparent,
      color,
      quality,
      confirmRaster,
      confirmAnimationOnly,
      confirmPalette,
    ],
  );
  const inspected = useMemo(() => {
    if (!options) return null;
    try {
      return { report: inspectRasterExport(project, options), error: "" };
    } catch (cause) {
      return {
        report: null,
        error: cause instanceof Error ? cause.message : "Opções de exportação inválidas.",
      };
    }
  }, [project, options]);
  const codecKey = video ? `${format}:${outputWidth}x${outputHeight}@${outputFps}:${quality}` : "";
  useEffect(() => {
    if (!codecKey || (format !== "mp4" && format !== "webm")) return;
    let current = true;
    void videoSupport({
      format,
      artboardId,
      animationId,
      width: outputWidth,
      height: outputHeight,
      fps: outputFps,
      background: color,
      quality,
    }).then((result) => {
      if (current) setCodec({ key: codecKey, ...result });
    });
    return () => {
      current = false;
    };
  }, [
    codecKey,
    format,
    artboardId,
    animationId,
    outputWidth,
    outputHeight,
    outputFps,
    color,
    quality,
  ]);
  const codecReady = !video || (codec?.key === codecKey && codec.supported);
  useEffect(() => {
    if (!options) return;
    onChange({ options, ready: !!inspected?.report?.supported && codecReady });
  }, [options, inspected, codecReady, onChange]);
  if (!format || !clip || !board) return null;
  const report = inspected?.report,
    issues = report?.issues ?? [];
  const resize = (axis: "width" | "height", value: number) => {
    if (!Number.isFinite(value)) return;
    const bounded = Math.round(
      Math.min(RASTER_LIMITS.maxSide, Math.max(RASTER_LIMITS.minSide, value)),
    );
    if (axis === "width") {
      setWidth(bounded);
      if (keepRatio) setHeight(rasterHeightFor(viewBox, bounded, false));
    } else {
      setHeight(bounded);
      if (keepRatio)
        setWidth(
          Math.round(
            Math.min(
              RASTER_LIMITS.maxSide,
              Math.max(RASTER_LIMITS.minSide, (bounded * (viewBox[2] ?? 1)) / (viewBox[3] ?? 1)),
            ),
          ),
        );
    }
  };
  return (
    <section aria-label="Opções de imagem e vídeo">
      <h3>{video ? "VÍDEO · QUADROS DO PLAYER" : "IMAGENS · QUADROS DO PLAYER"}</h3>
      <p>
        Cada quadro é desenhado pelo mesmo player do HTML interativo e do React e rasterizado no
        tamanho escolhido. {clip.name} · {clip.frames} quadros a {clip.fps} FPS · {clip.mode}.
      </p>
      <div className="export-grid">
        <label className="export-field">
          Largura (px)
          <input
            aria-label="Largura da exportação"
            type="number"
            min={RASTER_LIMITS.minSide}
            max={RASTER_LIMITS.maxSide}
            step={video ? 2 : 1}
            value={width}
            onChange={(event) => resize("width", Number(event.target.value))}
          />
        </label>
        <label className="export-field">
          Altura (px)
          <input
            aria-label="Altura da exportação"
            type="number"
            min={RASTER_LIMITS.minSide}
            max={RASTER_LIMITS.maxSide}
            step={video ? 2 : 1}
            value={height}
            onChange={(event) => resize("height", Number(event.target.value))}
          />
        </label>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={keepRatio}
          onChange={(event) => setKeepRatio(event.target.checked)}
        />
        <span>
          Manter a proporção da prancheta
          <small>
            {video && (width % 2 || height % 2)
              ? `Vídeo usa ${outputWidth}×${outputHeight} (dimensões pares).`
              : "Proporções diferentes seguem o ajuste da prancheta, sem distorcer."}
          </small>
        </span>
      </label>
      <label className="export-field">
        FPS de saída
        <select
          aria-label="FPS da exportação"
          value={fps}
          onChange={(event) => setFps(Number(event.target.value))}
        >
          {[...new Set([...FPS_CHOICES, clip.fps])]
            .filter((value) => value <= RASTER_LIMITS.maxFps)
            .sort((a, b) => a - b)
            .map((value) => (
              <option
                key={value}
                value={value}
                disabled={format === "gif" && value > RASTER_LIMITS.gifMaxFps}
              >
                {value} FPS{value === clip.fps ? " · original" : ""}
              </option>
            ))}
        </select>
      </label>
      {video ? (
        <label className="export-field">
          Cor de fundo
          <input
            aria-label="Cor de fundo do vídeo"
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
          />
        </label>
      ) : (
        <>
          <label className="check-row">
            <input
              aria-label="Fundo transparente"
              type="checkbox"
              checked={transparent}
              onChange={(event) => setTransparent(event.target.checked)}
            />
            <span>
              Fundo transparente
              <small>
                {format === "gif"
                  ? "GIF guarda cada pixel como transparente ou opaco; semitransparência vira uma das duas."
                  : "PNG preserva a transparência de cada pixel."}
              </small>
            </span>
          </label>
          {!transparent && (
            <label className="export-field">
              Cor de fundo
              <input
                aria-label="Cor de fundo"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </label>
          )}
        </>
      )}
      {video && (
        <label className="export-field">
          Qualidade
          <select
            aria-label="Qualidade do vídeo"
            value={quality}
            onChange={(event) => setQuality(event.target.value === "high" ? "high" : "standard")}
          >
            <option value="standard">Padrão · arquivo menor</option>
            <option value="high">Alta · dobro da taxa de bits</option>
          </select>
        </label>
      )}
      <div role="status" aria-live="polite">
        {inspected?.error ? (
          <p>{inspected.error}</p>
        ) : report ? (
          <>
            <p>
              {report.frames} quadros · {report.width}×{report.height} · {report.fps} FPS ·{" "}
              {report.durationSeconds.toFixed(2)} s{report.loop ? " · ciclo" : ""}
            </p>
            {video && codec?.key === codecKey && !codec.supported && (
              <p>Bloqueio: {codec.reason}</p>
            )}
            {video && codec?.key !== codecKey && <p>Verificando o codificador de vídeo…</p>}
            <ul>
              {issues
                .filter((issue) => !issue.code.startsWith("consent-"))
                .map((issue) => (
                  <li key={issue.code}>
                    {issue.severity === "error" ? "Bloqueio" : "Aviso"}: {issue.message}
                  </li>
                ))}
            </ul>
          </>
        ) : null}
      </div>
      <label className="check-row">
        <input
          aria-label="Confirmar conversão em imagens"
          type="checkbox"
          checked={confirmRaster}
          onChange={(event) => setConfirmRaster(event.target.checked)}
        />
        <span>
          Confirmo converter a animação em imagens
          <small>
            Vetores, texto selecionável, semântica para leitores de tela, áudio e interação não
            fazem parte do arquivo.
          </small>
        </span>
      </label>
      {report?.requiresAnimationOnlyConsent && (
        <label className="check-row">
          <input
            aria-label="Confirmar exportação somente da timeline"
            type="checkbox"
            checked={confirmAnimationOnly}
            onChange={(event) => setConfirmAnimationOnly(event.target.checked)}
          />
          <span>
            Confirmo exportar somente a timeline
            <small>
              Máquinas de estado não entram; inputs, dados e componentes ficam nos valores iniciais
              e o layout é calculado só neste tamanho.
            </small>
          </span>
        </label>
      )}
      {format === "gif" && (
        <label className="check-row">
          <input
            aria-label="Confirmar paleta do GIF"
            type="checkbox"
            checked={confirmPalette}
            onChange={(event) => setConfirmPalette(event.target.checked)}
          />
          <span>
            Aceito a paleta do GIF
            <small>Até 256 cores por quadro, sem pontilhado; degradês podem mostrar faixas.</small>
          </span>
        </label>
      )}
    </section>
  );
}

/** React island owned by the legacy export dialog, like the Lottie controls. */
export function createRasterExportControls(
  project: Project,
  artboardId: string,
  animationId: string,
  onReadyChange: () => void,
) {
  const element = document.createElement("div"),
    root = createRoot(element);
  let format: RasterFormat | null = null,
    disposed = false,
    settings: RasterSettings | null = null;
  const onChange = (next: RasterSettings) => {
    settings = next;
    onReadyChange();
  };
  function render() {
    root.render(
      <RasterExportPanel
        key={format ?? "none"}
        project={project}
        artboardId={artboardId}
        animationId={animationId}
        format={format}
        onChange={onChange}
      />,
    );
  }
  return {
    element,
    setFormat(value: RasterFormat | null) {
      if (disposed || format === value) return;
      format = value;
      settings = null;
      render();
      onReadyChange();
    },
    read: () => (settings ? { options: { ...settings.options }, ready: settings.ready } : null),
    dispose() {
      if (disposed) return;
      disposed = true;
      root.unmount();
    },
  };
}
