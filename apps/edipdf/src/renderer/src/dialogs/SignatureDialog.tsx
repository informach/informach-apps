import { focusOnMount } from "@informach/edi-desktop/renderer";
import {
  rotatedSignatureGeometry,
  type SignaturePlacement,
  signatureAnnotations,
} from "@shared/graphic-signature";
import { uid, viewSize } from "@shared/model";
import { EMPTY_SIGNATURE_CROP } from "@shared/signature-image";
import type { SavedSignature } from "@shared/types";
import { Eraser, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { bytesToDataUrl } from "../lib/actions";
import { chooseFiles } from "../lib/file-picker";
import { pageInfo } from "../lib/pdf";
import { prepareSignatureRaster } from "../lib/signature-raster";
import { activeDoc, commit, toast, useApp } from "../state/store";
import { Modal } from "./Dialogs";
import { SignaturePositionPicker } from "./SignaturePositionPicker";

type Mode = "draw" | "type" | "image";

const INKS = ["#111111", "#1D3FAF"];
const SCRIPT_FONTS = ["Segoe Script", "Ink Free", "Lucida Handwriting", "Brush Script MT"];
function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("O dispositivo não disponibilizou o desenho da assinatura.");
  return context;
}

/** Crops a canvas to its non-transparent pixels and returns a PNG data URL. */
function trimCanvas(
  c: HTMLCanvasElement,
): { src: string; width: number; height: number; left: number; top: number } | null {
  const ctx = canvasContext(c);
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const pad = 6;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width - 1, x1 + pad);
  y1 = Math.min(height - 1, y1 + pad);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  canvasContext(out).drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return {
    src: out.toDataURL("image/png"),
    width: out.width,
    height: out.height,
    left: x0,
    top: y0,
  };
}

function DrawPad({
  ink,
  canvasRef,
  strokesRef,
}: {
  ink: string;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  strokesRef: React.RefObject<NonNullable<SavedSignature["strokes"]>>;
}): React.ReactElement {
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => () => pending.current?.(), []);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = 1120;
    c.height = 360;
  }, [canvasRef]);
  const down = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!e.isPrimary || e.button !== 0 || pending.current) return;
    const c = e.currentTarget;
    c.setPointerCapture(e.pointerId);
    const ctx = canvasContext(c);
    const previous = ctx.getImageData(0, 0, c.width, c.height),
      pointerId = e.pointerId;
    const r = c.getBoundingClientRect();
    const k = c.width / r.width;
    const p = (ev: { clientX: number; clientY: number }) =>
      [(ev.clientX - r.left) * k, (ev.clientY - r.top) * k] as const;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    let [lx, ly] = p(e);
    const stroke = { points: [lx, ly], color: ink, width: 5 };
    strokesRef.current.push(stroke);
    let [mx, my] = [lx, ly];
    ctx.beginPath();
    ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
    const move = (ev: PointerEvent): void => {
      if (ev.pointerId !== pointerId) return;
      const [x, y] = p(ev);
      stroke.points.push(x, y);
      const nx = (lx + x) / 2;
      const ny = (ly + y) / 2;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.quadraticCurveTo(lx, ly, nx, ny);
      ctx.stroke();
      [mx, my, lx, ly] = [nx, ny, x, y];
    };
    const finish = (rollback: boolean): void => {
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", cancel);
      c.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("blur", blur);
      pending.current = null;
      if (rollback) {
        ctx.putImageData(previous, 0, 0);
        const index = strokesRef.current.indexOf(stroke);
        if (index >= 0) strokesRef.current.splice(index, 1);
      }
      if (c.hasPointerCapture(pointerId)) c.releasePointerCapture(pointerId);
    };
    const up = (event: PointerEvent): void => {
      if (event.pointerId === pointerId) finish(false);
    };
    const cancel = (event: PointerEvent): void => {
      if (event.pointerId === pointerId) finish(true);
    };
    const blur = (): void => finish(true);
    pending.current = () => finish(true);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", cancel);
    c.addEventListener("lostpointercapture", cancel);
    window.addEventListener("blur", blur);
  };
  return <canvas ref={canvasRef} className="sig-pad" onPointerDown={down} />;
}

export function SignatureDialog(): React.ReactElement {
  const signatures = useApp((s) => s.signatures);
  const [mode, setMode] = useState<Mode>("draw");
  const [ink, setInk] = useState(INKS[0]);
  const [name, setName] = useState("");
  const [font, setFont] = useState(SCRIPT_FONTS[0]);
  const [image, setImage] = useState<string | null>(null);
  const [dropWhite, setDropWhite] = useState(true);
  const [whiteLevel, setWhiteLevel] = useState(245);
  const [crop, setCrop] = useState({ ...EMPTY_SIGNATURE_CROP });
  const rasterOwner = useMemo(
    () => ({ image, removeWhite: dropWhite, whiteLevel, crop }),
    [image, dropWhite, whiteLevel, crop],
  );
  const [preparedRaster, setPreparedRaster] = useState<{
    owner: typeof rasterOwner;
    src: string;
    width: number;
    height: number;
  } | null>(null);
  const [rasterFailure, setRasterFailure] = useState<{
    owner: typeof rasterOwner;
    message: string;
  } | null>(null);
  const readyRaster = preparedRaster?.owner === rasterOwner ? preparedRaster : null;
  const rasterError = rasterFailure?.owner === rasterOwner ? rasterFailure.message : "";
  const original = useRef(activeDoc());
  const [placement, setPlacement] = useState<SignaturePlacement>();
  useEffect(() => {
    const controller = new AbortController();
    if (rasterOwner.image)
      void prepareSignatureRaster(rasterOwner.image, rasterOwner, controller.signal).then(
        (result) => {
          if (!controller.signal.aborted) setPreparedRaster({ owner: rasterOwner, ...result });
        },
        (failure: unknown) => {
          if (!controller.signal.aborted)
            setRasterFailure({
              owner: rasterOwner,
              message:
                failure instanceof Error
                  ? failure.message
                  : "Não foi possível preparar a assinatura.",
            });
        },
      );
    return () => controller.abort();
  }, [rasterOwner]);
  const [keep, setKeep] = useState(false);
  const [includeDate, setIncludeDate] = useState(false);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const padRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<NonNullable<SavedSignature["strokes"]>>([]);
  const close = (): void => {
    if (!running) useApp.setState({ dialog: null });
  };
  const execute = async (operation: () => Promise<void>) => {
    if (running) return;
    setRunning(true);
    setError("");
    try {
      await operation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível usar a assinatura.");
    } finally {
      setRunning(false);
    }
  };

  const use = async (signature: SavedSignature, save: boolean): Promise<void> => {
    const doc = activeDoc();
    if (!doc || doc.readOnly)
      throw new Error("Abra um documento editável para inserir a assinatura.");
    const checkSource = (): void => {
      const current = activeDoc(),
        source = original.current;
      if (
        !source ||
        current?.id !== source.id ||
        current.content !== source.content ||
        current.currentPage !== source.currentPage
      )
        throw new Error(
          "O documento ou a página mudou. Feche e abra novamente a assinatura para conferir o destino.",
        );
    };
    checkSource();
    if (rotation) {
      const image = new Image();
      image.src = signature.src;
      await image.decode();
      const geometry = rotatedSignatureGeometry(signature, rotation),
        canvas = document.createElement("canvas");
      canvas.width = geometry.width;
      canvas.height = geometry.height;
      const context = canvasContext(canvas);
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate((rotation * Math.PI) / 180);
      context.drawImage(image, -signature.width / 2, -signature.height / 2);
      signature = { ...signature, ...geometry, src: canvas.toDataURL("image/png") };
    }
    if (save)
      useApp.setState({
        signatures: await window.api.signatures.save(signature),
      });
    const page = doc.content.pages[doc.currentPage],
      size = viewSize(page, pageInfo(page));
    const annots = signatureAnnotations(
      signature,
      page.id,
      size,
      includeDate ? new Date().toLocaleDateString("pt-BR") : undefined,
      placement,
    );
    checkSource();
    if (
      !commit(doc.id, (content) => ({ ...content, annots: [...content.annots, ...annots] }), {
        selectedAnnot: annots[0].id,
        selectedAnnots: annots.map((annot) => annot.id),
        reading: false,
      })
    )
      throw new Error("A assinatura não foi aplicada ao documento.");
    useApp.setState({ tool: "select" });
    useApp.setState({ dialog: null });
  };

  const build = async (): Promise<Omit<SavedSignature, "id"> | null> => {
    if (mode === "draw") {
      const image = padRef.current ? trimCanvas(padRef.current) : null;
      return image
        ? {
            src: image.src,
            width: image.width,
            height: image.height,
            strokes: strokesRef.current.map((stroke) => ({
              ...stroke,
              points: stroke.points.map(
                (point, index) => point - (index % 2 ? image.top : image.left),
              ),
            })),
          }
        : null;
    }
    const c = document.createElement("canvas");
    if (mode === "type") {
      if (!name.trim()) return null;
      const ctx = canvasContext(c);
      ctx.font = `96px "${font}"`;
      const w = Math.ceil(ctx.measureText(name).width) + 40;
      c.width = w;
      c.height = 180;
      ctx.font = `96px "${font}"`;
      ctx.fillStyle = ink;
      ctx.textBaseline = "middle";
      ctx.fillText(name, 20, 90);
      return trimCanvas(c);
    }
    if (!image) return null;
    if (!readyRaster)
      throw new Error(rasterError || "Aguarde a preparação da prévia da assinatura.");
    return { src: readyRaster.src, width: readyRaster.width, height: readyRaster.height };
  };

  const apply = async (): Promise<void> => {
    const sig = await build();
    if (!sig) {
      toast(
        mode === "draw"
          ? "Desenhe sua assinatura primeiro."
          : mode === "type"
            ? "Digite seu nome."
            : "Escolha uma imagem.",
        { tone: "error" },
      );
      return;
    }
    await use({ id: uid("sig"), ...sig }, keep);
  };

  const pickImage = async (): Promise<void> => {
    const [f] = await chooseFiles({
      images: true,
      multi: false,
      title: "Imagem da assinatura",
    });
    if (f && /\.(png|jpe?g)$/i.test(f.name)) {
      try {
        setImage(bytesToDataUrl(f.bytes));
      } catch (failure) {
        toast(
          failure instanceof Error
            ? failure.message
            : "Não foi possível abrir a imagem de assinatura.",
          { tone: "error" },
        );
      }
    }
  };

  return (
    <Modal
      title="Assinar"
      width={620}
      onClose={close}
      footer={
        <>
          <span className="muted small">
            A assinatura é colocada na página atual; arraste para posicionar.
          </span>
          <div className="spacer" />
          <button type="button" className="btn ghost" disabled={running} onClick={close}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={running || (mode === "image" && !!image && !readyRaster)}
            onClick={() => void execute(apply)}
          >
            Usar assinatura
          </button>
        </>
      }
    >
      <div inert={running} className="signature-controls">
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <p className="muted small">
          Assinatura gráfica: insere uma aparência no documento. Não utiliza certificado digital.
        </p>
        <label className="local-field">
          <span>
            <input
              type="checkbox"
              checked={keep}
              onChange={(event) => setKeep(event.target.checked)}
            />{" "}
            Guardar esta assinatura neste dispositivo para reutilizar
          </span>
        </label>
        <label className="local-field">
          <span>
            <input
              type="checkbox"
              checked={includeDate}
              onChange={(event) => setIncludeDate(event.target.checked)}
            />{" "}
            Incluir a data atual junto da assinatura
          </span>
        </label>
        <label className="local-field">
          Girar antes de inserir
          <select
            className="input"
            aria-label="Girar antes de inserir"
            value={rotation}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (value === 0 || value === 90 || value === 180 || value === 270) setRotation(value);
            }}
          >
            <option value={0}>Sem giro</option>
            <option value={90}>90°</option>
            <option value={180}>180°</option>
            <option value={270}>270°</option>
          </select>
        </label>
        {original.current && (
          <>
            <button
              type="button"
              className="btn ghost sm"
              disabled={running || original.current.readOnly}
              onClick={() => {
                const doc = original.current;
                if (!doc) return;
                const page = doc.content.pages[doc.currentPage],
                  size = viewSize(page, pageInfo(page));
                setPlacement((current) =>
                  current ? undefined : { centerX: size.w / 2, centerY: size.h / 2, width: 170 },
                );
              }}
            >
              {placement ? "Usar posição central automática" : "Escolher posição na página"}
            </button>
            {placement && (
              <>
                <label className="local-field">
                  Largura da assinatura (pt)
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={10000}
                    step="any"
                    value={placement.width}
                    disabled={running}
                    onChange={(event) => {
                      const width = event.target.valueAsNumber;
                      if (Number.isFinite(width) && width >= 1 && width <= 10000)
                        setPlacement({ ...placement, width });
                    }}
                  />
                </label>
                <SignaturePositionPicker
                  doc={original.current}
                  placement={placement}
                  onChange={setPlacement}
                />
              </>
            )}
          </>
        )}
        {signatures.length > 0 && (
          <>
            <h4 className="dialog-sub">Assinaturas salvas</h4>
            <div className="sig-saved">
              {signatures.map((s) => (
                <div key={s.id} className="sig-item" title="Usar esta assinatura">
                  <button
                    type="button"
                    className="card-open"
                    aria-label="Usar esta assinatura"
                    disabled={running}
                    onClick={() => void execute(() => use(s, false))}
                  />
                  <img src={s.src} alt="Assinatura" />
                  <button
                    type="button"
                    className="icon-btn sm sig-del"
                    style={{ zIndex: 2 }}
                    title="Apagar"
                    disabled={running}
                    onClick={(e) => {
                      e.stopPropagation();
                      void execute(async () =>
                        useApp.setState({ signatures: await window.api.signatures.remove(s.id) }),
                      );
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            <h4 className="dialog-sub">Nova assinatura</h4>
          </>
        )}
        <div className="seg tabs-seg">
          {(
            [
              ["draw", "Desenhar"],
              ["type", "Digitar"],
              ["image", "Imagem"],
            ] as const
          ).map(([m, l]) => (
            <button
              type="button"
              key={m}
              className={`seg-btn wide${mode === m ? " on" : ""}`}
              onClick={() => setMode(m)}
            >
              {l}
            </button>
          ))}
          <div className="spacer" />
          {mode !== "image" &&
            INKS.map((c) => (
              <button
                type="button"
                key={c}
                className={`swatch${ink === c ? " on" : ""}`}
                style={{ background: c }}
                title={c === INKS[0] ? "Preto" : "Azul"}
                onClick={() => setInk(c)}
              />
            ))}
        </div>
        <div className="sig-area" hidden={mode !== "draw"}>
          <DrawPad ink={ink} canvasRef={padRef} strokesRef={strokesRef} />
          <div className="sig-line" />
          <button
            type="button"
            className="btn ghost sm sig-clear"
            onClick={() => {
              const c = padRef.current;
              if (c) c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
              strokesRef.current = [];
            }}
          >
            <Eraser size={13} /> Limpar
          </button>
        </div>
        {mode === "type" && (
          <div className="sig-type">
            <input
              className="input"
              placeholder="Seu nome"
              aria-label="Nome para assinatura"
              maxLength={200}
              value={name}
              ref={focusOnMount}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="sig-fonts">
              {SCRIPT_FONTS.map((f) => (
                <button
                  type="button"
                  key={f}
                  className={`sig-font${font === f ? " on" : ""}`}
                  style={{ fontFamily: `"${f}"`, color: ink }}
                  onClick={() => setFont(f)}
                >
                  {name || "Sua assinatura"}
                </button>
              ))}
            </div>
          </div>
        )}
        {mode === "image" && (
          <div className="sig-image">
            {readyRaster ? (
              <div className="signature-raster-preview">
                <img
                  src={readyRaster.src}
                  alt="Prévia da assinatura com a limpeza e o recorte aplicados"
                  style={{
                    transform: `rotate(${rotation}deg)`,
                    maxWidth: rotation % 180 ? 160 : "100%",
                  }}
                />
              </div>
            ) : image ? (
              rasterError ? (
                <p className="error-text" role="alert">
                  {rasterError}
                </p>
              ) : (
                <p role="status">Preparando a assinatura…</p>
              )
            ) : (
              <p className="muted">Uma foto ou digitalização da sua assinatura em papel branco.</p>
            )}
            <div className="sig-image-actions">
              <button
                type="button"
                className="btn ghost sm"
                disabled={running}
                onClick={() => void execute(pickImage)}
              >
                <Upload size={13} /> {image ? "Trocar imagem" : "Escolher imagem"}
              </button>
              <label className="check">
                <input
                  type="checkbox"
                  checked={dropWhite}
                  onChange={(e) => setDropWhite(e.target.checked)}
                />{" "}
                Remover fundo branco
              </label>
            </div>
            {image && (
              <>
                <label className="local-field">
                  Limite de branco
                  <input
                    className="input"
                    type="range"
                    min={150}
                    max={255}
                    step={1}
                    value={whiteLevel}
                    disabled={!dropWhite || running}
                    onChange={(event) => setWhiteLevel(event.target.valueAsNumber)}
                  />
                  <span className="muted small">
                    {whiteLevel}/255 — valores menores removem mais tons claros. Confira os traços
                    na prévia.
                  </span>
                </label>
                <div className="local-numbers">
                  {(
                    [
                      ["left", "esquerda"],
                      ["top", "superior"],
                      ["right", "direita"],
                      ["bottom", "inferior"],
                    ] as const
                  ).map(([edge, label]) => (
                    <label className="local-field" key={edge}>
                      Recorte {label} (%)
                      <input
                        className="input"
                        type="number"
                        min={0}
                        max={95}
                        step={1}
                        value={Math.round(crop[edge] * 100)}
                        disabled={running}
                        onChange={(event) => {
                          const value = event.target.valueAsNumber;
                          if (Number.isFinite(value) && value >= 0 && value <= 95)
                            setCrop((current) => ({ ...current, [edge]: value / 100 }));
                        }}
                      />
                    </label>
                  ))}
                </div>
                <button
                  className="btn ghost sm"
                  type="button"
                  disabled={running}
                  onClick={() => setCrop({ ...EMPTY_SIGNATURE_CROP })}
                >
                  Restaurar recorte
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
