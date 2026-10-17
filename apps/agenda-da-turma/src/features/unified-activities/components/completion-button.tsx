"use client";

import { Button } from "@informach/ui/components/button";
import { cn } from "@informach/ui/lib/utils";
import { Check } from "lucide-react";
import { useState } from "react";
import { noticeErrorMessage } from "@/features/notices/messages";
import { submitTaskStatus } from "@/features/offline-queue/client";
import { QueuedBadge } from "@/features/offline-queue/components/queued-badge";
import { useQueueOwner } from "@/features/offline-queue/owner";
import { isActionRejected } from "@/lib/action-result";
import { useCardToggle } from "../hooks/use-card-toggle";

/**
 * Marcar como feito, na página de detalhe.
 *
 * Quando todo título de card passou a abrir a atividade, o detalhe virou um
 * destino sem a ação mais comum: dava para editar, cancelar e ler o histórico,
 * mas não para dizer que já foi feito: a pessoa tinha que voltar ao card. O
 * controle aqui é o mesmo do card, com os mesmos rótulos, e mora numa barra
 * fixa no pé do detalhe, onde o polegar alcança.
 */
export function ActivityCompletionButton({
  id,
  version,
  initialStatus,
  title,
}: {
  id: string;
  version: number;
  initialStatus: "pending" | "done";
  title: string;
}) {
  const [error, setError] = useState("");
  const queueOwner = useQueueOwner();

  const { ready, isDone, pending, queued, handleToggle } = useCardToggle({
    initialStatus,
    version,
    taskId: id,
    optimisticHideWhenDone: false,
    toggleAction: (next, latest) =>
      submitTaskStatus({ id, version: latest ?? version, status: next, title, userId: queueOwner }),
    onSuccess: () => setError(""),
    onError: (actionError) =>
      setError(
        isActionRejected(actionError)
          ? "Não foi possível atualizar. Atualize a página e tente de novo."
          : noticeErrorMessage(actionError.code),
      ),
  });

  return (
    <div className="space-y-2">
      {queued || error || isDone ? (
        <div className="space-y-1 rounded-2xl border border-foreground/15 bg-background px-4 py-2.5 text-sm">
          {queued ? <QueuedBadge className="font-normal" /> : null}
          {error ? (
            <p role="alert" className="text-destructive-ink">
              {error}
            </p>
          ) : isDone ? (
            <p className="text-muted-foreground">
              Vale só para a sua casa: a escola não recebe aviso.
            </p>
          ) : null}
        </div>
      ) : null}
      <Button
        variant={isDone ? "outline" : "default"}
        className={cn(
          "h-14 w-full rounded-2xl text-base font-extrabold",
          isDone
            ? "border-chart-2/50 bg-background text-foreground hover:bg-chart-2/10"
            : "shadow-solid-primary",
        )}
        aria-label={`${isDone ? "Reabrir" : "Marcar como feito"}: ${title}`}
        disabled={!ready || pending}
        onClick={() => handleToggle(!isDone)}
      >
        {isDone ? (
          <>
            <Check className="mr-2 size-5 text-chart-2-ink" aria-hidden />
            Feito. Toque para reabrir
          </>
        ) : (
          <>
            <span className="mr-2 size-5 rounded-full border-2 border-current" aria-hidden />
            Marcar como feito
          </>
        )}
      </Button>
    </div>
  );
}
