import { showModalOnMount } from "@informach/edi-desktop/renderer";
import type { ReactNode } from "react";
import { useUi } from "@/state/ui";

export function Toasts(): ReactNode {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          {t.text}
          {t.action && (
            <button type="button" onClick={t.action.run}>
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog(): ReactNode {
  const c = useUi((s) => s.confirm);
  if (!c) return null;
  return (
    <dialog
      ref={showModalOnMount}
      aria-label={c.title}
      onCancel={(event) => {
        event.preventDefault();
        c.resolve(false);
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
      onMouseDown={(e) => e.target === e.currentTarget && c.resolve(false)}
    >
      <div className="modal modal-sm">
        <div className="modal-head">
          <strong>{c.title}</strong>
        </div>
        <div className="modal-body">
          <p>{c.text}</p>
        </div>
        <div className="modal-foot">
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => c.resolve(false)}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => c.resolve(true)}>
            {c.okLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
