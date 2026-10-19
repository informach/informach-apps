import { showModalOnMount } from "@informach/edi-desktop/renderer";
import { type ChromaKey, DEFAULT_KEY, detectScreen, keyUsable, rgbToHex } from "@shared/chroma";
import { borderColor } from "@shared/masks";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { requireBitmap } from "@/engine/bitmaps";
import { attempt } from "@/lib/actions";
import { applyChromaKey } from "@/lib/chroma";
import { useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";
import { Slider } from "@/ui/controls";
import "./chroma.css";

const close = (): void => {
  useUi.setState({ chromaOpen: false });
};

export function ChromaKeyDialog(): ReactNode {
  const [source] = useState(() => {
    const s = useDoc.getState(),
      layer = s.doc?.layers.find((l) => l.id === s.activeId);
    if (!layer || layer.kind !== "raster") return null;
    const bitmap = requireBitmap(layer.bitmap);
    return {
      layer,
      version: bitmap.version,
      image: bitmap.ctx.getImageData(0, 0, layer.width, layer.height),
    };
  });
  const [key, setKey] = useState<ChromaKey>(() => ({
    ...DEFAULT_KEY,
    color: source
      ? (detectScreen(source.image.data, 4, source.image.width, source.image.height) ??
        borderColor(source.image.data, source.image.width, source.image.height) ??
        "#ffffff")
      : "#00FF00",
  }));
  const [method, setMethod] = useState<"chroma" | "uniform">(() =>
    source && detectScreen(source.image.data, 4, source.image.width, source.image.height)
      ? "chroma"
      : "uniform",
  );
  const [tolerance, setTolerance] = useState(30),
    [feather, setFeather] = useState(0);
  const [result, setResult] = useState<{
    pixels: Uint8ClampedArray;
    key: ChromaKey;
    method: string;
    tolerance: number;
    feather: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("result");
  const [background, setBackground] = useState("checker");
  const [zoom, setZoom] = useState(false);
  const [picking, setPicking] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const usable = method === "uniform" || keyUsable(key.color);
  const ready =
    result?.key === key &&
    result.method === method &&
    result.tolerance === tolerance &&
    result.feather === feather &&
    usable;

  useEffect(() => {
    if (!source || !usable) return;
    let worker: Worker | undefined;
    let active = true;
    setError("");
    const timer = setTimeout(() => {
      try {
        worker = new Worker(new URL("../lib/chroma.worker.ts", import.meta.url), {
          type: "module",
        });
        worker.onmessage = (
          event: MessageEvent<{ pixels?: Uint8ClampedArray; error?: string }>,
        ) => {
          if (!active) return;
          if (event.data.error) setError(event.data.error);
          else if (event.data.pixels)
            setResult({ pixels: event.data.pixels, key, method, tolerance, feather });
          worker?.terminate();
        };
        worker.onerror = () => {
          if (active)
            setError(
              "Não foi possível processar esta imagem. Tente novamente com uma imagem menor.",
            );
          worker?.terminate();
        };
        const pixels = source.image.data.slice();
        worker.postMessage(
          {
            pixels,
            width: source.image.width,
            height: source.image.height,
            key,
            method,
            tolerance,
            feather,
          },
          [pixels.buffer],
        );
      } catch (e) {
        setError((e as Error).message);
      }
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
      worker?.terminate();
    };
  }, [source, key, method, tolerance, feather, usable]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    canvas.width = source.image.width;
    canvas.height = source.image.height;
    const pixels = (
      mode === "original" || picking || !result ? source.image.data : result.pixels
    ).slice();
    if (mode === "mask" && !picking && result) {
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = pixels[i + 1] = pixels[i + 2] = pixels[i + 3];
        pixels[i + 3] = 255;
      }
    }
    canvas.getContext("2d")!.putImageData(new ImageData(pixels, canvas.width, canvas.height), 0, 0);
  }, [source, result, mode, picking]);

  if (!source) return null;
  return (
    <dialog
      ref={showModalOnMount}
      aria-label="Remover fundo"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      style={{
        margin: 0,
        padding: 0,
        border: 0,
        maxWidth: "none",
        maxHeight: "none",
        width: "100vw",
        height: "100vh",
      }}
      className="backdrop"
    >
      <div className="modal chroma-modal">
        <div className="modal-head">
          <strong>Remover fundo · Chroma key</strong>
          <span className="spacer" />
          <button type="button" className="btn" onClick={close}>
            Cancelar
          </button>
        </div>
        <div className="chroma-body">
          <div className="chroma-preview-column">
            <div className="chroma-toolbar">
              <select
                className="field"
                aria-label="Visualização"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="result">Resultado</option>
                <option value="original">Original</option>
                <option value="mask">Máscara</option>
              </select>
              <select
                className="field"
                aria-label="Fundo da prévia"
                value={background}
                onChange={(e) => setBackground(e.target.value)}
              >
                <option value="checker">Transparência</option>
                <option value="#ffffff">Branco</option>
                <option value="#151515">Escuro</option>
                <option value="#888888">Cinza</option>
              </select>
              <button
                type="button"
                className="btn"
                aria-pressed={zoom}
                onClick={() => setZoom(!zoom)}
              >
                {zoom ? "Ajustar à janela" : "Ver a 100%"}
              </button>
            </div>
            <div
              className={`chroma-preview ${background === "checker" ? "chroma-checker" : ""} ${zoom ? "chroma-zoom" : ""}`}
              style={{ backgroundColor: background === "checker" ? undefined : background }}
            >
              <canvas
                ref={canvasRef}
                aria-label="Prévia da imagem; use o conta-gotas para selecionar a cor do fundo"
                style={{ cursor: picking ? "crosshair" : "default" }}
                onClick={(e) => {
                  if (!picking) return;
                  const box = e.currentTarget.getBoundingClientRect(),
                    { width, height, data } = source.image;
                  const x = Math.max(
                    0,
                    Math.min(width - 1, Math.floor(((e.clientX - box.left) * width) / box.width)),
                  );
                  const y = Math.max(
                    0,
                    Math.min(height - 1, Math.floor(((e.clientY - box.top) * height) / box.height)),
                  );
                  const samples: number[][] = [[], [], []];
                  for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy++)
                    for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx++) {
                      const i = (yy * width + xx) * 4;
                      if (data[i + 3] < 250) continue;
                      for (let c = 0; c < 3; c++) samples[c].push(data[i + c]);
                    }
                  if (!samples[0].length) {
                    setError("Escolha uma região opaca do fundo.");
                    return;
                  }
                  const rgb = samples.map((s) => s.sort((a, b) => a - b)[s.length >> 1]);
                  setKey({ ...key, color: rgbToHex(rgb[0], rgb[1], rgb[2]) });
                  setPicking(false);
                }}
              />
            </div>
            <p className="chroma-caption">
              {picking
                ? "Clique no fundo da imagem original para colher a cor."
                : `${source.layer.name} · ${source.image.width} × ${source.image.height} px · resolução original. Prévia antes da máscara e da mesclagem.`}
            </p>
          </div>
          <div className="chroma-controls">
            <p>Funciona melhor com fundos de cor uniforme. Confira a prévia antes de aplicar.</p>
            <label>
              Método
              <select
                className="field"
                aria-label="Método de recorte"
                value={method}
                onChange={(event) =>
                  setMethod(event.target.value === "chroma" ? "chroma" : "uniform")
                }
              >
                <option value="uniform">Fundo uniforme</option>
                <option value="chroma">Fundo verde ou azul</option>
              </select>
            </label>
            <label className="chroma-color">
              Cor do fundo{" "}
              <input
                type="color"
                value={key.color}
                onChange={(e) => setKey({ ...key, color: e.target.value })}
              />
              <span>{key.color.toUpperCase()}</span>
            </label>
            <div className="chroma-toolbar">
              <button
                type="button"
                className="btn"
                aria-pressed={picking}
                onClick={() => setPicking(!picking)}
              >
                Conta-gotas
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const color =
                    method === "uniform"
                      ? borderColor(source.image.data, source.image.width, source.image.height)
                      : detectScreen(source.image.data, 4, source.image.width, source.image.height);
                  if (color) setKey({ ...key, color });
                  else setError("Não encontrei uma cor uniforme nas bordas. Use o conta-gotas.");
                }}
              >
                Detectar cor
              </button>
            </div>
            {method === "uniform" ? (
              <>
                <Slider
                  label="Tolerância da cor"
                  value={tolerance}
                  min={0}
                  max={150}
                  onChange={setTolerance}
                />
                <Slider
                  label="Suavizar borda"
                  value={feather}
                  min={0}
                  max={12}
                  unit=" px"
                  onChange={setFeather}
                />
                <p>
                  Retira apenas regiões ligadas às bordas. Objetos com a mesma cor do fundo podem
                  precisar de refinamento manual.
                </p>
              </>
            ) : (
              <>
                <Slider
                  label="Preservar o objeto"
                  value={key.threshold * 100}
                  min={0}
                  max={90}
                  unit="%"
                  onChange={(v) => setKey({ ...key, threshold: v / 100 })}
                />
                <p>Aumente se roupas ou detalhes ficarem transparentes.</p>
                <Slider
                  label="Transição das bordas"
                  value={key.softness * 100}
                  min={2}
                  max={100}
                  unit="%"
                  onChange={(v) => setKey({ ...key, softness: v / 100 })}
                />
                <Slider
                  label="Remover reflexo da cor"
                  value={key.despill * 100}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => setKey({ ...key, despill: v / 100 })}
                />
                <Slider
                  label="Recolher borda"
                  value={key.choke}
                  min={0}
                  max={4}
                  unit=" px"
                  onChange={(v) => setKey({ ...key, choke: v })}
                />
                <p>Use 0 para preservar fios finos. Confira o recorte sobre branco e escuro.</p>
              </>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => setKey({ ...DEFAULT_KEY, color: key.color })}
            >
              Restaurar ajustes
            </button>
            <p role="status">
              {!usable
                ? "Escolha uma cor saturada de fundo, como verde ou azul."
                : error || (ready ? "Prévia pronta." : "Refinando o recorte…")}
            </p>
          </div>
        </div>
        <div className="modal-foot">
          <span>Aplicar mantém a máscara existente e permite desfazer.</span>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!ready || !!error}
            onClick={() =>
              attempt(() => {
                if (!result || !ready) throw new Error("Aguarde a prévia terminar.");
                applyChromaKey(source.layer, source.version, result.pixels);
                close();
              })
            }
          >
            Aplicar recorte
          </button>
        </div>
      </div>
    </dialog>
  );
}
