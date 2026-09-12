"use client";
import { Button } from "@informach/ui/components/button";
import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  return (
    <article className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        {action.status !== "canceled" ? (
          <Button
            size="icon"
            variant={action.status === "done" ? "secondary" : "outline"}
            className="size-11 shrink-0 rounded-full"
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
              <span className="size-4 rounded-full border-2 border-muted-foreground/50" />
            )}
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">
            {item.profileName} · {ACTION_LABELS[action.type]}
            {item.source ? ` · ${SOURCE_LABELS[item.source]}` : " · Planejamento da família"}
          </p>
          <Link
            href={`/recados/acoes/${action.id}`}
            className={`mt-1 block break-words font-semibold hover:underline ${action.status !== "pending" ? "text-muted-foreground line-through" : ""}`}
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
          <p className="mt-1 text-xs text-muted-foreground">
            {DATE_ORIGIN_LABELS[action.dateOrigin]} ·{" "}
            {item.assignedName ? `${item.assignedName} cuida` : "Responsável a combinar"}
          </p>
          {action.version > 1 ? (
            <p className="mt-2 text-xs font-medium text-primary">
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
