import { explainSaveError, saveErrorDetail } from "@shared/saveError";
import { AlertTriangle, Loader } from "lucide-react";
import type { ReactNode } from "react";
import {
  type DraftChoice,
  type LeaveChoice,
  useDraftPrompt,
  useLeavePrompt,
} from "@/lib/leaveGuard";
import { Button, Modal } from "@/ui";

/** Asked by confirmLeave() when a draft is waiting for review: it would be lost on leaving. */
export function DraftLeaveDialog(): ReactNode {
  const { title, answer } = useDraftPrompt();
  if (title === null) return null;
  const choose = (choice: DraftChoice): void => answer?.(choice);
  return (
    <Modal label="Rascunho esperando revisão" width={560} onClose={() => choose("cancel")}>
      <div className="export-head">
        <AlertTriangle size={20} className="warn-icon" />
        <div className="spacer">
          <h2 className="modal-title">Há um rascunho esperando revisão</h2>
          <p className="muted">
            "{title}" ainda não entrou na aula. O rascunho fica só nesta sessão: ao sair, aplique
            agora ou descarte.
          </p>
        </div>
      </div>
      <div className="export-foot">
        <Button variant="ghost" onClick={() => choose("discard")}>
          Descartar
        </Button>
        <span className="spacer" />
        <Button onClick={() => choose("cancel")}>Cancelar</Button>
        <Button variant="primary" onClick={() => choose("apply")}>
          Aplicar e sair
        </Button>
      </div>
    </Modal>
  );
}

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
          <p>{explainSaveError(error)}</p>
          <p className="muted">Se sair agora, as alterações desde o último salvamento se perdem.</p>
        </div>
      </div>
      <div className="modal-body">
        <details className="error-details">
          <summary>Ver detalhes</summary>
          <pre className="error-box">{saveErrorDetail(error)}</pre>
        </details>
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
