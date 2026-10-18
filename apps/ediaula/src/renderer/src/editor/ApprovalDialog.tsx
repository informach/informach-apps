import type { AiApprovalChoice, AiApprovalRequest } from "@shared/types";
import { ShieldQuestion } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { create } from "zustand";
import { useProject } from "@/state/project";
import { Button, Modal } from "@/ui";

/** Writes asked by AI apps that may only read and propose, waiting for the person. */
const useApprovals = create<{ queue: AiApprovalRequest[] }>(() => ({ queue: [] }));

/** The permit buttons only work after this, so a click meant for something else never approves. */
const ARM_DELAY_MS = 600;

/** Listens for approval requests from the main process (mcpServer.ts). */
export function listenAiApprovals(): () => void {
  return window.api.onAiApproval((request) => {
    const { queue } = useApprovals.getState();
    if ("closed" in request) {
      useApprovals.setState({ queue: queue.filter((r) => r.id !== request.id) });
      return;
    }
    useApprovals.setState({ queue: [...queue, request] });
  });
}

function answer(request: AiApprovalRequest, choice: AiApprovalChoice): void {
  useApprovals.setState({ queue: useApprovals.getState().queue.filter((r) => r !== request) });
  void window.api.answerAiApproval(request.id, choice, useProject.getState().project?.id ?? null);
}

/**
 * "Permitir uma vez", "Permitir por 15 min neste projeto" or "Negar"; silence denies in 60 s.
 * Each request is a dialog of its own: a new one opens fresh with "Negar" focused, and the
 * permit buttons wait a moment before they work.
 */
export function ApprovalDialog(): ReactNode {
  const request = useApprovals((s) => s.queue[0]);
  if (!request) return null;
  return <ApprovalRequest key={request.id} request={request} />;
}

function ApprovalRequest({ request }: { request: AiApprovalRequest }): ReactNode {
  const project = useProject((s) => s.project);
  const [now, setNow] = useState(() => Date.now());
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const arm = setTimeout(() => setArmed(true), ARM_DELAY_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(arm);
      clearInterval(tick);
    };
  }, []);
  const left = Math.max(0, Math.ceil((request.expiresAt - now) / 1000));
  return (
    <Modal label="Pedido de alteração da IA" width={620} onClose={() => answer(request, "deny")}>
      <div className="export-head">
        <ShieldQuestion size={20} className="accent" />
        <div className="spacer">
          <h2 className="modal-title">A IA quer alterar a aula</h2>
          <p className="muted">
            {request.client} pediu para fazer uma alteração
            {project ? ` em "${project.name}"` : ""}. Ela só pode ler e propor; para mudar a aula,
            precisa da sua permissão.
          </p>
        </div>
      </div>
      <div className="modal-body">
        <p>
          <strong>{request.title}</strong>
        </p>
        <p className="muted small">Tudo o que a IA mandou nesta alteração:</p>
        <pre className="error-box approval-details">{request.details}</pre>
        <p className="muted small">Sem resposta, o pedido é negado em {left} s.</p>
      </div>
      <div className="export-foot">
        <Button variant="ghost" autoFocus onClick={() => answer(request, "deny")}>
          Negar
        </Button>
        <span className="spacer" />
        <Button disabled={!armed || !project} onClick={() => answer(request, "project")}>
          Permitir por 15 min neste projeto
        </Button>
        <Button
          variant="primary"
          disabled={!armed || !project}
          onClick={() => answer(request, "once")}
        >
          Permitir uma vez
        </Button>
      </div>
    </Modal>
  );
}
