import { focusOnMount } from "@informach/edi-desktop/renderer";
import { uid } from "@shared/model";
import { Eraser, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { bytesToDataUrl, placeImage } from "../lib/actions";
import { toast, useApp } from "../state/store";
import { Modal } from "./Dialogs";

type Mode = "draw" | "type" | "image";

const INKS = ["#111111", "#1D3FAF"];
const SCRIPT_FONTS = ["Segoe Script", "Ink Free", "Lucida Handwriting", "Brush Script MT"];

/** Crops a canvas to its non-transparent pixels and returns a PNG data URL. */
function trimCanvas(c: HTMLCanvasElement): { src: string; width: number; height: number } | null {
  const ctx = c.getContext("2d")!;
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
  out.getContext("2d")!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return { src: out.toDataURL("image/png"), width: out.width, height: out.height };
}

function DrawPad({
  ink,
  canvasRef,
}: {
  ink: string;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}): React.ReactElement {
  useEffect(() => {
    const c = canvasRef.current!;
    c.width = 1120;
    c.height = 360;
  }, [canvasRef]);
  const down = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const c = e.currentTarget;
    c.setPointerCapture(e.pointerId);
    const ctx = c.getContext("2d")!;
    const r = c.getBoundingClientRect();
    const k = c.width / r.width;
    const p = (ev: { clientX: number; clientY: number }) =>
      [(ev.clientX - r.left) * k, (ev.clientY - r.top) * k] as const;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    let [lx, ly] = p(e);
    let [mx, my] = [lx, ly];
    ctx.beginPath();
    ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
    const move = (ev: PointerEvent): void => {
      const [x, y] = p(ev);
      const nx = (lx + x) / 2;
      const ny = (ly + y) / 2;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.quadraticCurveTo(lx, ly, nx, ny);
      ctx.stroke();
      [mx, my, lx, ly] = [nx, ny, x, y];
    };
    const up = (): void => {
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
    };
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
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
  const padRef = useRef<HTMLCanvasElement>(null);
  const close = (): void => {
    useApp.setState({ dialog: null });
  };

  const use = async (
    src: string,
    save: boolean,
    width?: number,
    height?: number,
  ): Promise<void> => {
    if (save && width && height)
      useApp.setState({
        signatures: await window.api.signatures.save({ id: uid("sig"), src, width, height }),
      });
    close();
    await placeImage(src, { signature: true, maxWidth: 170 });
  };

  const build = async (): Promise<{ src: string; width: number; height: number } | null> => {
    if (mode === "draw") return padRef.current ? trimCanvas(padRef.current) : null;
    const c = document.createElement("canvas");
    if (mode === "type") {
      if (!name.trim()) return null;
      const ctx = c.getContext("2d")!;
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
    const img = new Image();
    img.src = image;
    await img.decode();
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    if (dropWhite) {
      // Light pixels become transparent so a photographed signature sits cleanly on the page.
      const d = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < d.data.length; i += 4) {
        const lum = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
        if (lum > 200) d.data[i + 3] = 0;
        else if (lum > 150) d.data[i + 3] = Math.round(((200 - lum) / 50) * d.data[i + 3]);
      }
      ctx.putImageData(d, 0, 0);
    }
    return trimCanvas(c);
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
    await use(sig.src, true, sig.width, sig.height);
  };

  const pickImage = async (): Promise<void> => {
    const [f] = await window.api.openDialog({
      images: true,
      multi: false,
      title: "Imagem da assinatura",
    });
    if (f && /\.(png|jpe?g)$/i.test(f.name)) setImage(bytesToDataUrl(f.bytes));
  };

  return (
    <Modal
      title="Assinar"
      width={620}
      footer={
        <>
          <span className="muted small">
            A assinatura é colocada na página atual; arraste para posicionar.
          </span>
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={close}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={() => void apply()}>
            Usar assinatura
          </button>
        </>
      }
    >
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
                  onClick={() => void use(s.src, false)}
                />
                <img src={s.src} alt="Assinatura" />
                <button
                  type="button"
                  className="icon-btn sm sig-del"
                  style={{ zIndex: 2 }}
                  title="Apagar"
                  onClick={async (e) => {
                    e.stopPropagation();
                    useApp.setState({ signatures: await window.api.signatures.remove(s.id) });
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
      {mode === "draw" && (
        <div className="sig-area">
          <DrawPad key={ink} ink={ink} canvasRef={padRef} />
          <div className="sig-line" />
          <button
            type="button"
            className="btn ghost sm sig-clear"
            onClick={() => {
              const c = padRef.current;
              if (c) c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
            }}
          >
            <Eraser size={13} /> Limpar
          </button>
        </div>
      )}
      {mode === "type" && (
        <div className="sig-type">
          <input
            className="input"
            placeholder="Seu nome"
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
          {image ? (
            <img src={image} alt="" />
          ) : (
            <p className="muted">Uma foto ou digitalização da sua assinatura em papel branco.</p>
          )}
          <div className="sig-image-actions">
            <button type="button" className="btn ghost sm" onClick={() => void pickImage()}>
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
        </div>
      )}
    </Modal>
  );
}
