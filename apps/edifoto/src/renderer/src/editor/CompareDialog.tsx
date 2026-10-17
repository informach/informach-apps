import { showModalOnMount } from "@informach/edi-desktop/renderer";
import { BLEND_MODES, type BlendMode } from "@shared/blendModes";
import { type ReactNode, useEffect, useState } from "react";
import { compositor } from "@/engine/compositor";
import { attempt } from "@/lib/actions";
import { setLayerProps } from "@/lib/ops";
import { useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";

const close = (): void => {
  useUi.setState({ compareOpen: false });
};

export function CompareDialog(): ReactNode {
  const doc = useDoc((s) => s.doc),
    id = useDoc((s) => s.activeId),
    layer = doc?.layers.find((l) => l.id === id);
  const [a, setA] = useState<BlendMode>(layer?.blendMode ?? "normal"),
    [b, setB] = useState<BlendMode>("softLight"),
    [images, setImages] = useState<string[]>([]);
  useEffect(() => {
    if (!doc || !id) return;
    const c = compositor(),
      scale = Math.min(1, 720 / Math.max(doc.width, doc.height));
    setImages(
      [a, b].map((mode) =>
        c.renderToCanvas(doc, { scale, modeOverride: { layerId: id, mode } }).toDataURL(),
      ),
    );
  }, [doc, id, a, b]);
  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <dialog
      ref={showModalOnMount}
      aria-label="Comparar mesclagens"
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
      <div className="modal" style={{ width: "min(1100px,95vw)" }}>
        <div className="modal-head">
          <strong>Comparar lado a lado · {layer?.name}</strong>
          <span className="spacer" />
          <button type="button" className="btn" onClick={close}>
            Fechar
          </button>
        </div>
        <div className="modal-body compare-grid">
          {[
            { id: "left", mode: a },
            { id: "right", mode: b },
          ].map(({ id: side, mode }, i) => (
            <div key={side} className="compare-option">
              <select
                className="field"
                aria-label={`Mesclagem ${i + 1}`}
                value={mode}
                onChange={(e) => (i ? setB : setA)(e.target.value as BlendMode)}
              >
                {BLEND_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <img src={images[i]} alt={`Prévia ${i + 1}`} />
              <button
                type="button"
                className="btn btn-primary"
                disabled={!id}
                onClick={() =>
                  attempt(() => {
                    setLayerProps(id!, { blendMode: mode });
                    close();
                  })
                }
              >
                Aplicar esta versão
              </button>
            </div>
          ))}
        </div>
      </div>
    </dialog>
  );
}
