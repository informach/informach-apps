import { showModalOnMount } from "@informach/edi-desktop/renderer";
import { type ReactNode, useState } from "react";
import { actions } from "@/lib/actions";
import { useUi } from "@/state/ui";

export function NewDocumentDialog(): ReactNode {
  const [name, setName] = useState("Sem título");
  const [width, setWidth] = useState("1920");
  const [height, setHeight] = useState("1080");
  const [background, setBackground] = useState("white");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = (): void => {
    if (!busy) useUi.setState({ newDocumentOpen: false });
  };
  return (
    <dialog
      ref={showModalOnMount}
      aria-label="Novo documento"
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
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <form
        className="modal modal-sm"
        aria-labelledby="new-document-title"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await actions.createDocument(
              name,
              Number(width),
              Number(height),
              background === "white" ? "#ffffff" : null,
            );
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-head">
          <strong id="new-document-title">Novo documento</strong>
        </div>
        <div className="modal-body" style={{ display: "grid", gap: 16 }}>
          <label>
            Nome
            <input
              className="field"
              value={name}
              maxLength={120}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="grid2">
            <label>
              Largura (px)
              <input
                className="field"
                type="number"
                required
                min={1}
                max={8192}
                step={1}
                value={width}
                disabled={busy}
                onChange={(e) => setWidth(e.target.value)}
              />
            </label>
            <label>
              Altura (px)
              <input
                className="field"
                type="number"
                required
                min={1}
                max={8192}
                step={1}
                value={height}
                disabled={busy}
                onChange={(e) => setHeight(e.target.value)}
              />
            </label>
          </div>
          <label>
            Fundo
            <select
              className="field"
              value={background}
              disabled={busy}
              onChange={(e) => setBackground(e.target.value)}
            >
              <option value="white">Branco</option>
              <option value="transparent">Transparente</option>
            </select>
          </label>
          {error && <p role="alert">{error}</p>}
        </div>
        <div className="modal-foot">
          <span className="spacer" />
          <button className="btn" type="button" disabled={busy} onClick={close}>
            Cancelar
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Criando…" : "Criar documento"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
