"use client";
import { Button } from "@informach/ui/components/button";
import { cn } from "@informach/ui/lib/utils";
import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getActivityPresentation } from "@/features/unified-activities/presentation";
import { catchActionResult } from "@/lib/action-result";
import { setNoticeStatusAction } from "../actions";
import { noticeErrorMessage } from "../messages";
import type { NoticeActionRow } from "../repository";
import { ACTION_LABELS, DATE_ORIGIN_LABELS, SOURCE_LABELS } from "../schemas";

export function RoutineCard({ item }: { item: NoticeActionRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { action } = item;
  const presentation = getActivityPresentation(action.type);
  const TypeIcon = presentation.icon;
  return (
    <article
      className={cn(
        "rounded-2xl border p-4 sm:p-5",
        action.status === "pending" ? presentation.surface : "border-border bg-card",
      )}
    >
      <div className="flex items-start gap-3">
        {action.status !== "canceled" ? (
          <Button
            size="icon"
            variant={action.status === "done" ? "secondary" : "outline"}
            className={cn(
              "size-11 shrink-0 rounded-2xl",
              action.status === "done"
                ? "bg-chart-2/20 text-foreground hover:bg-chart-2/30"
                : "border-foreground/20 bg-background/60 hover:bg-background",
            )}
            aria-label={`${action.status === "done" ? "Reabrir" : "Marcar como feito em casa"}: ${action.title}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              const result = await catchActionResult(() =>
                setNoticeStatusAction({
                  id: action.id,
                  version: action.version,
                  status: action.status === "done" ? "pending" : "done",
                }),
              );
              setBusy(false);
              if (!result.ok) setError(noticeErrorMessage(result.error.code));
              router.refresh();
            }}
          >
            {action.status === "done" ? (
              <Check className="size-5" aria-hidden />
            ) : (
              <span className="size-4 rounded-full border-2 border-foreground/60" />
            )}
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 break-words text-sm font-semibold">{item.profileName}</span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium text-foreground",
                presentation.surface,
              )}
            >
              <TypeIcon className="size-3.5" aria-hidden />
              {ACTION_LABELS[action.type]}
            </span>
          </div>
          <Link
            href={`/recados/acoes/${action.id}`}
            className={`mt-2 block break-words text-base font-semibold leading-relaxed hover:underline ${action.status !== "pending" ? "text-muted-foreground line-through" : ""}`}
          >
            {action.title}
          </Link>
          <p className="mt-2 text-sm">
            {action.status === "canceled"
              ? "Cancelado"
              : action.status === "done"
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
  );
}
