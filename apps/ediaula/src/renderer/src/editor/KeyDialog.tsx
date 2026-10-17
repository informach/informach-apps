import { type ChromaKey, keyFrame, rgbToHex } from "@shared/chroma";
import { clipEnd, sourceAt } from "@shared/timeline";
import type { Asset } from "@shared/types";
import { Loader, Pipette, Wand2, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { duration as fmtDuration } from "@/lib/format";
import { usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { Button, IconButton, Modal } from "@/ui";

type Backdrop = "checker" | "light" | "dark" | "original";
const BACKDROPS: [Backdrop, string][] = [
  ["checker", "Xadrez"],
  ["light", "Claro"],
  ["dark", "Escuro"],
  ["original", "Original"],
];

/** Where to look first: the playhead if it is over this media, otherwise a bit into the video. */
function startTime(asset: Asset): number {
  const t = usePlayback.getState().time;
  const clip = useProject
    .getState()
    .project?.clips.find((c) => c.assetId === asset.id && t >= c.start && t < clipEnd(c));
  return clip ? sourceAt(clip, t) : Math.min(asset.duration * 0.4, 30);
}

/**
 * Fine-tuning of background removal on a real frame. Uses the very same keyer as the cached
 * video, so what is shown here is what the preview and the export will show.
 */
export function KeyDialog({
  asset,
  initial,
  onClose,
  onApply,
}: {
  asset: Asset;
  initial: ChromaKey;
  onClose: () => void;
  onApply: (k: ChromaKey) => void;
}): ReactNode {
  const [key, setKey] = useState(initial);
  const [time, setTime] = useState(() => startTime(asset));
  const [frame, setFrame] = useState<{ width: number; height: number; data: Uint8Array } | null>(
    null,
  );
  const [backdrop, setBackdrop] = useState<Backdrop>("checker");
  const [zoom, setZoom] = useState(false);
  const [picking, setPicking] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let alive = true;
    setFrame(null);
    const timer = setTimeout(() => {
      void window.api
        .grabFrame(asset.path, time, asset.width, asset.height, 1280)
        .then((f) => alive && setFrame(f));
    }, 120);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [asset.path, asset.width, asset.height, time]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !frame) return;
    const id = requestAnimationFrame(() => {
      el.width = frame.width;
      el.height = frame.height;
      const ctx = el.getContext("2d")!;
      const img = ctx.createImageData(frame.width, frame.height);
      if (backdrop === "original") {
        for (let i = 0, s = 0; s < frame.data.length; i += 4, s += 3) {
          img.data[i] = frame.data[s];
          img.data[i + 1] = frame.data[s + 1];
          img.data[i + 2] = frame.data[s + 2];
          img.data[i + 3] = 255;
        }
      } else keyFrame(frame.data, 3, frame.width, frame.height, key, img.data);
      ctx.putImageData(img, 0, 0);
    });
    return () => cancelAnimationFrame(id);
  }, [frame, key, backdrop]);

  const pick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!picking || !frame) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * frame.width);
    const y = Math.floor(((e.clientY - r.top) / r.height) * frame.height);
    const s = (y * frame.width + x) * 3;
    setKey({ ...key, color: rgbToHex(frame.data[s], frame.data[s + 1], frame.data[s + 2]) });
    setPicking(false);
  };

  const row = (
    label: string,
    field: "threshold" | "softness" | "despill" | "choke",
    min: number,
    max: number,
    step: number,
    fmt: (v: number) => string,
    hint: string,
  ): ReactNode => (
    <label className="slider-row" title={hint}>
      <span className="muted">{label}</span>
      <input
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={key[field]}
        onChange={(e) => setKey({ ...key, [field]: Number(e.target.value) })}
      />
      <span className="mono slider-value">{fmt(key[field])}</span>
    </label>
  );
  const pct = (v: number): string => `${Math.round(v * 100)}%`;

  return (
    <Modal label="Ajustar remoção de fundo" onClose={onClose} width={900}>
      <div className="export-head">
        <Wand2 size={18} className="accent" />
        <div className="spacer">
          <h2 className="modal-title">Remover fundo: {asset.name}</h2>
          <p className="muted">
            O que você vê aqui é exatamente o que vai para a prévia e para a exportação.
          </p>
        </div>
        <IconButton icon={X} label="Fechar" onClick={onClose} />
      </div>
      <div className="key-dialog">
        <div
          className={`key-view backdrop-${backdrop === "original" ? "dark" : backdrop} ${zoom ? "is-zoom" : ""}`}
        >
          {!frame && (
            <div className="key-loading">
              <Loader size={16} className="spin" /> Lendo o quadro…
            </div>
          )}
          <canvas
            ref={canvas}
            onClick={pick}
            className={picking ? "is-picking" : ""}
            style={{ visibility: frame ? "visible" : "hidden" }}
          />
        </div>
        <div className="key-controls">
          <div className="chip-row">
            {BACKDROPS.map(([id, label]) => (
              <button
                type="button"
                key={id}
                className={`chip ${backdrop === id ? "is-active" : ""}`}
                onClick={() => setBackdrop(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="chip-row">
            <button
              type="button"
              className={`chip ${!zoom ? "is-active" : ""}`}
              onClick={() => setZoom(false)}
            >
              Inteiro
            </button>
            <button
              type="button"
              className={`chip ${zoom ? "is-active" : ""}`}
              onClick={() => setZoom(true)}
            >
              Rosto e cabelo
            </button>
          </div>
          <label className="slider-row">
            <span className="muted">Momento</span>
            <input
              type="range"
              className="range"
              min={0}
              max={Math.max(0.1, asset.duration - 0.1)}
              step={0.1}
              value={time}
              onChange={(e) => setTime(Number(e.target.value))}
            />
            <span className="mono slider-value">{fmtDuration(time)}</span>
          </label>
          <div className="key-color-row">
            <span className="key-swatch" style={{ background: key.color }} />
            <span className="mono">{key.color}</span>
            <span className="spacer" />
            <Button
              size="sm"
              variant={picking ? "primary" : "ghost"}
              icon={Pipette}
              onClick={() => {
                setPicking(!picking);
                setBackdrop("original");
              }}
            >
              {picking ? "Clique no fundo" : "Conta-gotas"}
            </Button>
          </div>
          {row(
            "Proteger roupa",
            "threshold",
            0,
            0.8,
            0.01,
            pct,
            "Suba se a roupa azul ficar transparente; desça se sobrar fundo.",
          )}
          {row(
            "Suavidade",
            "softness",
            0.05,
            1,
            0.01,
            pct,
            "Largura da borda entre o que fica e o que sai.",
          )}
          {row(
            "Tirar reflexo",
            "despill",
            0,
            1,
            0.05,
            pct,
            "Remove o azul que o fundo refletiu no cabelo e na pele.",
          )}
          {row(
            "Afinar contorno",
            "choke",
            0,
            4,
            1,
            (v) => `${v} px`,
            "Come alguns pixels da borda para sumir com um contorno que sobrou.",
          )}
          <div className="spacer" />
          <div className="row-10 key-actions">
            <Button variant="ghost" onClick={() => setKey(initial)}>
              Desfazer ajustes
            </Button>
            <span className="spacer" />
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                onApply(key);
                onClose();
              }}
            >
              Aplicar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
