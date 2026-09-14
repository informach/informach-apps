"use client";
import { Button } from "@informach/ui/components/button";
import { cn } from "@informach/ui/lib/utils";
import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ACTIVITY_TYPE_LABELS } from "@/features/unified-activities/activity-types";
import { useCardToggle } from "@/features/unified-activities/hooks/use-card-toggle";
import { getActivityPresentation } from "@/features/unified-activities/presentation";
import { setNoticeStatusAction } from "../actions";
import { noticeErrorMessage } from "../messages";
import type { NoticeActionRow } from "../repository";
import { DATE_ORIGIN_LABELS, SOURCE_LABELS } from "../schemas";

type Props = {
  item: NoticeActionRow;
  /**
   * Mesma semântica dos demais cards: nos buckets da rotina o item some ao
   * ser concluído, com a animação de colapso. `useCardToggle` cuida do timing.
   */
  optimisticHideWhenDone?: boolean;
  onStatusSuccess?: (
    item: NoticeActionRow,
    previousStatus: "pending" | "done",
    nextStatus: "pending" | "done",
  ) => void;
};

export function RoutineCard({ item, optimisticHideWhenDone = false, onStatusSuccess }: Props) {
  const [error, setError] = useState("");
  const { action } = item;
  const presentation = getActivityPresentation(action.type);
  const TypeIcon = presentation.icon;
  const isCanceled = action.status === "canceled";

  // O hook trabalha com pending/done. `canceled` é um terceiro estado que não
  // se alterna — o botão simplesmente não é renderizado nesse caso.
  const { isDone, isExiting, optimisticallyHidden, pending, handleToggle } = useCardToggle({
    initialStatus: action.status === "done" ? "done" : "pending",
    optimisticHideWhenDone: optimisticHideWhenDone && !isCanceled,
    toggleAction: (next) =>
      setNoticeStatusAction({ id: action.id, version: action.version, status: next }),
    onSuccess: (previousStatus, nextStatus) => {
      setError("");
      onStatusSuccess?.(item, previousStatus, nextStatus);
    },
    onError: (actionError) => setError(noticeErrorMessage(actionError.code)),
  });

  if (optimisticallyHidden) return null;

  return (
    <div
      className={cn(
        "grid grid-rows-[1fr] opacity-100",
        "starting:grid-rows-[0fr] starting:opacity-0",
        "transition-all duration-300 ease-out motion-reduce:transition-none",
        "[transition-behavior:allow-discrete]",
        isExiting && "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="overflow-hidden">
        <article
          className={cn(
            "rounded-2xl border p-4 sm:p-5",
            !isCanceled && !isDone ? presentation.surface : "border-border bg-card",
            isDone && "opacity-70",
          )}
        >
          <div className="flex items-start gap-3">
            {!isCanceled ? (
              <Button
                size="icon"
                variant={isDone ? "secondary" : "outline"}
                className={cn(
                  "size-11 shrink-0 rounded-2xl",
                  isDone
                    ? "bg-chart-2/20 text-foreground hover:bg-chart-2/30"
                    : "border-foreground/20 bg-background/60 hover:bg-background",
                )}
                aria-label={`${isDone ? "Reabrir" : "Marcar como feito em casa"}: ${action.title}`}
                disabled={pending}
                onClick={() => handleToggle(!isDone)}
              >
                {isDone ? (
                  <Check className="size-5" aria-hidden />
                ) : (
                  <span className="size-4 rounded-full border-2 border-foreground/60" />
                )}
              </Button>
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 break-words text-sm font-semibold">
                  {item.profileName}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium text-foreground",
                    presentation.surface,
                  )}
                >
                  <TypeIcon className="size-3.5" aria-hidden />
                  {ACTIVITY_TYPE_LABELS[action.type]}
                </span>
              </div>
              <Link
                href={`/recados/acoes/${action.id}`}
                className={`mt-2 block break-words text-base font-semibold leading-relaxed hover:underline ${isCanceled || isDone ? "text-muted-foreground line-through" : ""}`}
              >
                {action.title}
              </Link>
              <p className="mt-2 text-sm">
                {isCanceled
                  ? "Cancelado"
                  : isDone
                    ? "Feito em casa"
                    : action.dueAt
                      ? `${action.dueAt.split("-").reverse().join("/")}${action.time ? ` às ${action.time}` : ""}`
                      : "Prazo a confirmar"}
              </p>
              <p className="mt-1 break-words text-xs text-foreground/80">
                {item.assignedName
                  ? `Acompanhamento: ${item.assignedName}`
                  : "Combine o acompanhamento em família"}
              </p>
              <p className="mt-1 text-xs text-foreground/80">
                {item.source ? SOURCE_LABELS[item.source] : "Planejamento da família"}
                {item.source || action.dateOrigin !== "family"
                  ? ` · ${DATE_ORIGIN_LABELS[action.dateOrigin]}`
                  : ""}
              </p>
              {action.version > 1 ? (
                <p className="mt-2 text-xs font-semibold text-foreground">
                  Atualizado · versão {action.version} · veja o histórico
                </p>
              ) : null}
            </div>
          </div>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </article>
      </div>
    </div>
  );
}
