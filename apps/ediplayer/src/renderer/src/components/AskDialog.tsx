import { useEffect, useRef } from "react";
import { answerAsk, useStore } from "../state/store";

/**
 * A yes/no question in the window (store.ask), in place of the system's box: it looks like the
 * player and never names the package. Escape or Cancelar is no; Cancelar starts focused.
 */
export function AskDialog() {
  const ask = useStore((s) => s.ask);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (ask && d && !d.open) d.showModal();
    if (!ask && d?.open) d.close();
  }, [ask]);
  return (
    <dialog
      ref={ref}
      className="save ask"
      aria-label="Confirmar"
      onClose={() => {
        if (useStore.getState().ask) answerAsk(false);
      }}
    >
      {ask && (
        <div className="save-body">
          <p>{ask.message}</p>
          <div className="row ask-actions">
            {/* biome-ignore lint/a11y/noAutofocus: the safe answer is focused when the question opens */}
            <button type="button" className="btn" autoFocus onClick={() => answerAsk(false)}>
              Cancelar
            </button>
            <button type="button" className="btn primary" onClick={() => answerAsk(true)}>
              {ask.confirm}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
