import type { AiApprovalChoice, AiApprovalRequest } from "@shared/types";
import { ShieldQuestion } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { create } from "zustand";
import { useProject } from "@/state/project";
import { Button, Modal } from "@/ui";

/** Writes asked by AI apps that may only read and propose, waiting for the person. */
const useApprovals = create<{ queue: AiApprovalRequest[] }>(() => ({ queue: [] }));

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

/** "Permitir uma vez", "Permitir por 15 min neste projeto" or "Negar"; silence denies in 60 s. */
export function ApprovalDialog(): ReactNode {
  const request = useApprovals((s) => s.queue[0]);
  const project = useProject((s) => s.project);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!request) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [request]);
  if (!request) return null;
  const left = Math.max(0, Math.ceil((request.expiresAt - now) / 1000));
  return (
    <Modal label="Pedido de alteração da IA" width={560} onClose={() => answer(request, "deny")}>
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
        <pre className="error-box">{request.summary}</pre>
        <p className="muted small">Sem resposta, o pedido é negado em {left} s.</p>
      </div>
      <div className="export-foot">
        <Button variant="ghost" onClick={() => answer(request, "deny")}>
          Negar
        </Button>
        <span className="spacer" />
        <Button disabled={!project} onClick={() => answer(request, "project")}>
          Permitir por 15 min neste projeto
        </Button>
        <Button variant="primary" disabled={!project} onClick={() => answer(request, "once")}>
          Permitir uma vez
        </Button>
      </div>
    </Modal>
  );
}
