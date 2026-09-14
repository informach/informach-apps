"use client";

import { Button } from "@informach/ui/components/button";
import { cn } from "@informach/ui/lib/utils";
import { Check } from "lucide-react";
import { useState } from "react";
import { setActivityStatusAction } from "@/features/activities/actions";
import { setNoticeStatusAction } from "@/features/notices/actions";
import { noticeErrorMessage } from "@/features/notices/messages";
import { setProfileSubjectActivityStatusAction } from "@/features/profile-subject-activities/actions";
import { isActionRejected } from "@/lib/action-result";
import { useCardToggle } from "../hooks/use-card-toggle";
import type { ActivityToggleTarget } from "../view";

/**
 * Marcar como feito, na página de detalhe.
 *
 * Quando todo título de card passou a abrir a atividade, o detalhe virou um
 * destino sem a ação mais comum: dava para editar, cancelar e ler o histórico,
 * mas não para dizer que já foi feito — a pessoa tinha que voltar ao card. O
 * controle aqui é o mesmo do card, inclusive o alvo de 44 px e os rótulos.
 */
export function ActivityCompletionButton({
  target,
  initialStatus,
  title,
}: {
  target: ActivityToggleTarget;
  initialStatus: "pending" | "done";
  title: string;
}) {
  const [error, setError] = useState("");

  const { isDone, pending, handleToggle } = useCardToggle({
    initialStatus,
    optimisticHideWhenDone: false,
    toggleAction: (next) => {
      if (target.kind === "notice")
        return setNoticeStatusAction({ id: target.id, version: target.version, status: next });
      if (target.kind === "extra")
        return setProfileSubjectActivityStatusAction({ id: target.id, status: next });
      return setActivityStatusAction({
        activityId: target.activityId,
        studentProfileId: target.studentProfileId,
        status: next,
      });
    },
    onSuccess: () => setError(""),
    onError: (actionError) =>
      setError(
        isActionRejected(actionError)
          ? "Não foi possível atualizar. Atualize a página e tente de novo."
          : target.kind === "notice"
            ? noticeErrorMessage(actionError.code)
            : "Não foi possível atualizar.",
      ),
  });

  return (
    <div className="space-y-2">
      <Button
        variant={isDone ? "secondary" : "outline"}
        className={cn("min-h-11", isDone && "bg-chart-2/20 text-foreground hover:bg-chart-2/30")}
        aria-label={`${isDone ? "Reabrir" : "Marcar como feito em casa"}: ${title}`}
        disabled={pending}
        onClick={() => handleToggle(!isDone)}
      >
        {isDone ? (
          <>
            <Check className="mr-2 size-4" aria-hidden />
            Feito em casa
          </>
        ) : (
          <>
            <span className="mr-2 size-4 rounded-full border-2 border-foreground/60" />
            Marcar como feito em casa
          </>
        )}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
