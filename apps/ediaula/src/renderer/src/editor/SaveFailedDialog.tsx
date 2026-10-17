import { AlertTriangle, Loader } from "lucide-react";
import type { ReactNode } from "react";
import { type LeaveChoice, useLeavePrompt } from "@/lib/leaveGuard";
import { Button, Modal } from "@/ui";

/** Asked by confirmLeave() when the project could not be saved before leaving it. */
export function SaveFailedDialog(): ReactNode {
  const { error, busy, saving, answer } = useLeavePrompt();
  if (error === null)
    return saving ? (
      <div className="leave-saving" role="status">
        <Loader size={14} className="spin" /> Salvando antes de fechar…
      </div>
    ) : null;
  const choose = (choice: LeaveChoice): void => answer?.(choice);
  return (
    <Modal label="Não foi possível salvar" width={600} onClose={() => choose("cancel")}>
      <div className="export-head">
        <AlertTriangle size={20} className="warn-icon" />
        <div className="spacer">
          <h2 className="modal-title">Não foi possível salvar o projeto</h2>
          <p className="muted">
            Se sair agora, as alterações desde o último salvamento se perdem. Tente de novo ou salve
            uma cópia em outro lugar.
          </p>
        </div>
      </div>
      <div className="modal-body">
        <pre className="error-box">{error}</pre>
      </div>
      <div className="export-foot">
        <Button variant="ghost" disabled={busy} onClick={() => choose("discard")}>
          Sair sem salvar
        </Button>
        <span className="spacer" />
        <Button disabled={busy} onClick={() => choose("cancel")}>
          Cancelar
        </Button>
        <Button disabled={busy} onClick={() => choose("copy")}>
          Salvar cópia…
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => choose("retry")}>
          Tentar de novo
        </Button>
      </div>
    </Modal>
  );
}
