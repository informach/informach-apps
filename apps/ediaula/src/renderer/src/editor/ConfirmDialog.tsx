import { withRenderKeys } from "@informach/edi-desktop/renderer";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { useConfirmPrompt } from "@/lib/confirm";
import { Button, Modal } from "@/ui";

/** The question of lib/confirm.ts askConfirm, when one is open. */
export function ConfirmDialog(): ReactNode {
  const { question, answer } = useConfirmPrompt();
  if (!question || !answer) return null;
  return (
    <Modal label={question.title} onClose={() => answer(false)} width={520}>
      <div className="confirm-dialog">
        <div className="confirm-head">
          <AlertTriangle size={18} className="warn" />
          <h2 className="modal-title">{question.title}</h2>
        </div>
        <p>{question.message}</p>
        {question.items?.length ? (
          <ul className="confirm-items">
            {withRenderKeys(question.items, (item) => item).map(({ key, value }) => (
              <li key={key}>{value}</li>
            ))}
          </ul>
        ) : null}
        <div className="confirm-actions">
          {/* Not exporting is the safe answer and the one in focus. */}
          <Button variant="primary" autoFocus onClick={() => answer(false)}>
            {question.cancel}
          </Button>
          <Button variant="ghost" onClick={() => answer(true)}>
            {question.confirm}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
