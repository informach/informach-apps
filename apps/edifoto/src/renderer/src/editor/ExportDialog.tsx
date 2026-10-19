import { showModalOnMount } from "@informach/edi-desktop/renderer";
import { Download, Link2, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { attempt } from "@/lib/actions";
import { type ExportSpec, exportTo, renderExport } from "@/lib/files";
import { resizeImage } from "@/lib/ops";
import { useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";
import { NumberField, Slider } from "@/ui/controls";

const SCALES = [
  { label: "100%", value: 1 },
  { label: "75%", value: 0.75 },
  { label: "50%", value: 0.5 },
  { label: "25%", value: 0.25 },
];

export function ExportDialog(): ReactNode {
  const doc = useDoc((s) => s.doc);
  const [spec, setSpec] = useState<ExportSpec>(() => useUi.getState().exportPreference);
  const [busy, setBusy] = useState(false);
  const cancelled = useRef(false),
    workspaceId = useRef(useDoc.getState().initialStateId);
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);
  const [preview, setPreview] = useState("");
  const [previewError, setPreviewError] = useState("");
  useEffect(() => {
    if (!doc) return;
    let active = true,
      url: string | undefined;
    setPreviewError("");
    void renderExport({
      ...spec,
      scale: Math.min(spec.scale, 512 / Math.max(doc.width, doc.height)),
    })
      .then((bytes) => {
        if (!active) return;
        url = URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], { type: `image/${spec.format}` }),
        );
        setPreview(url);
      })
      .catch((error: unknown) => {
        if (active) setPreviewError(error instanceof Error ? error.message : "Falha na prévia.");
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc, spec]);
  if (!doc) return null;
  const close = (): void => {
    cancelled.current = true;
    useUi.setState({ exportOpen: false });
  };
  const w = Math.round(doc.width * spec.scale);
  const h = Math.round(doc.height * spec.scale);
  const go = (): void => {
    attempt(async () => {
      if (busy) return;
      setBusy(true);
      try {
        const ext = spec.format === "jpeg" ? "jpg" : spec.format;
        const path = await window.api.pickSavePath(`${doc.name}.${ext}`, spec.format);
        if (!path) return;
        if (
          cancelled.current ||
          useDoc.getState().doc?.id !== doc.id ||
          useDoc.getState().initialStateId !== workspaceId.current
        )
          throw new Error("A imagem mudou. Abra a exportação novamente.");
        const out = await exportTo(path, spec, () => {
          if (cancelled.current || useDoc.getState().initialStateId !== workspaceId.current)
            throw new Error("Exportação cancelada.");
        });
        useUi.setState({ exportPreference: spec });
        close();
        useUi.getState().toast(`Exportado: ${out.split(/[\\/]/).pop()}`, "ok", {
          label: "Mostrar na pasta",
          run: () => void window.api.showInFolder(out),
        });
      } finally {
        setBusy(false);
      }
    });
  };
  return (
    <dialog
      ref={showModalOnMount}
      aria-label="Exportar imagem"
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
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal modal-sm">
        <div className="modal-head">
          <Download size={16} className="accent" />
          <strong>Exportar imagem</strong>
          <span className="spacer" />
          <button type="button" className="icon-btn" onClick={close}>
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">
          {preview && (
            <div className="export-preview">
              <img src={preview} alt="Prévia da exportação" />
            </div>
          )}
          {previewError && <p role="alert">{previewError}</p>}
          <div className="seg" style={{ alignSelf: "flex-start" }}>
            {(["jpeg", "png", "webp"] as const).map((f) => (
              <button
                type="button"
                key={f}
                className={spec.format === f ? "is-on" : ""}
                onClick={() => setSpec({ ...spec, format: f })}
              >
                {f === "jpeg" ? "JPEG" : f.toUpperCase()}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12 }}>
            {spec.format === "jpeg" &&
              "Menor arquivo, ideal para redes sociais e WhatsApp. Áreas transparentes ficam brancas."}
            {spec.format === "png" &&
              "Sem perda de qualidade e mantém transparência. Arquivo maior."}
            {spec.format === "webp" &&
              "Moderno: arquivos pequenos com transparência. Ótimo para sites."}
          </p>
          {spec.format !== "png" && (
            <Slider
              label="Qualidade"
              value={spec.quality}
              min={40}
              max={100}
              unit="%"
              onChange={(quality) => setSpec({ ...spec, quality })}
            />
          )}
          <div className="row">
            <span className="muted" style={{ fontSize: 12 }}>
              Tamanho
            </span>
            <div className="seg">
              {SCALES.map((s) => (
                <button
                  type="button"
                  key={s.label}
                  className={spec.scale === s.value ? "is-on" : ""}
                  onClick={() => setSpec({ ...spec, scale: s.value })}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <span className="spacer" />
            <span className="mono" style={{ fontSize: 12 }}>
              {w} × {h}
            </span>
          </div>
          <NumberField
            label="Largura final"
            value={w}
            min={1}
            max={8192}
            suffix="px"
            onChange={(value) => setSpec({ ...spec, scale: value / doc.width })}
          />
          <p className="hint">
            O projeto continua editável. A prévia acima é reduzida; o arquivo usa o tamanho
            escolhido.
          </p>
        </div>
        <div className="modal-foot">
          <span className="spacer" />
          <button type="button" className="btn" onClick={close}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={go}>
            <Download size={14} /> {busy ? "Exportando…" : "Exportar…"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function ResizeDialog(): ReactNode {
  const doc = useDoc((s) => s.doc);
  const [w, setW] = useState(doc?.width ?? 1);
  const [h, setH] = useState(doc?.height ?? 1);
  const [linked, setLinked] = useState(true);
  if (!doc) return null;
  const ratio = doc.width / doc.height;
  const close = (): void => {
    useUi.setState({ resizeOpen: false });
  };
  const input = (
    id: string,
    value: number,
    set: (v: number) => void,
    other: (v: number) => void,
    k: number,
  ): ReactNode => (
    <input
      id={id}
      className="field mono"
      style={{ width: 100 }}
      type="number"
      min={1}
      max={16000}
      value={value}
      onChange={(e) => {
        const v = Math.max(1, Math.round(Number(e.target.value) || 1));
        set(v);
        if (linked) other(Math.max(1, Math.round(v * k)));
      }}
    />
  );
  return (
    <dialog
      ref={showModalOnMount}
      aria-label="Tamanho da imagem"
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
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal modal-sm">
        <div className="modal-head">
          <strong>Tamanho da imagem</strong>
          <span className="spacer" />
          <button type="button" className="icon-btn" onClick={close}>
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">
          <div className="row">
            <label className="num-field" htmlFor="resize-width">
              Largura {input("resize-width", w, setW, setH, 1 / ratio)}
            </label>
            <button
              type="button"
              className={`icon-btn${linked ? " is-on" : ""}`}
              title="Manter proporção"
              onClick={() => setLinked(!linked)}
            >
              <Link2 size={14} />
            </button>
            <label className="num-field" htmlFor="resize-height">
              Altura {input("resize-height", h, setH, setW, ratio)}
            </label>
          </div>
          <div className="seg" style={{ alignSelf: "flex-start" }}>
            {[25, 50, 75, 150, 200].map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => {
                  setW(Math.round((doc.width * p) / 100));
                  setH(Math.round((doc.height * p) / 100));
                }}
              >
                {p}%
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12 }}>
            Atual: {doc.width} × {doc.height} px. As camadas acompanham; dá para desfazer.
          </p>
        </div>
        <div className="modal-foot">
          <span className="spacer" />
          <button type="button" className="btn" onClick={close}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              attempt(() => {
                resizeImage(w, h);
                close();
                useUi.setState((s) => ({ fitRequest: s.fitRequest + 1 }));
              })
            }
          >
            Aplicar
          </button>
        </div>
      </div>
    </dialog>
  );
}
