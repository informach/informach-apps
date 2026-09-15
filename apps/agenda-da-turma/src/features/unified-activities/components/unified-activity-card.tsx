"use client";

import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@informach/ui/components/dropdown-menu";
import { cn } from "@informach/ui/lib/utils";
import { Check, MoreVertical, Pencil, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setNoticeStatusAction } from "@/features/notices/actions";
import { noticeErrorMessage } from "@/features/notices/messages";
import { getSubjectTintedClassByIndex } from "@/features/subjects/utils";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { ACTIVITY_TYPE_LABELS } from "../activity-types";
import { useCardToggle } from "../hooks/use-card-toggle";
import type { ActivityOverviewItem } from "../overview-types";
import { getActivityPresentation } from "../presentation";
import { getViewDueBadge, toActivityView } from "../view";

type Props = {
  entry: ActivityOverviewItem;
  currentUserId: string;
  /** Nos buckets da rotina o item some ao ser concluído, com colapso animado. */
  optimisticHideWhenDone?: boolean;
  onStatusSuccess?: (
    entry: ActivityOverviewItem,
    previousStatus: "pending" | "done",
    nextStatus: "pending" | "done",
  ) => void;
};

function toggleErrorMessage(error: { code: string }): string {
  if (isActionRejected(error))
    return "Não foi possível atualizar. Atualize a página e tente de novo.";
  return noticeErrorMessage(error.code);
}

/**
 * O card da rotina, um só para as três fontes.
 *
 * Antes eram três: um `Card` com checkbox para a atividade da turma, um
 * `<article>` com botão de 44 px para a que veio de recado, e um terceiro,
 * inline, para a extracurricular. Cada um mostrava o prazo de um jeito, abria
 * um destino diferente ao toque no título — ou nenhum — e tratava erro num
 * lugar diferente. A origem é invisível no card, mas decidia o que a família
 * podia fazer.
 *
 * A forma que ficou é a de melhor toque: alvo de 44 px, título que sempre
 * abre a atividade, prazo em badge mesmo quando não há prazo, e o menu de
 * ações quando a pessoa pode editar.
 */
export function UnifiedActivityCard({
  entry,
  currentUserId,
  optimisticHideWhenDone = false,
  onStatusSuccess,
}: Props) {
  const router = useRouter();
  const view = toActivityView(entry, currentUserId);
  const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [canceling, startCancel] = useTransition();

  const isCanceled = view.status === "canceled";
  const presentation = getActivityPresentation(view.type);
  const TypeIcon = presentation.icon;
  // Com matéria vinculada o card é lido pela cor dela — é assim que a família
  // reconhece a rotina. Sem vínculo, segue a cor do tipo.
  const surface =
    view.subjectColorIndex !== null
      ? getSubjectTintedClassByIndex(view.subjectColorIndex)
      : presentation.surface;

  const { isDone, isExiting, optimisticallyHidden, pending, handleToggle } = useCardToggle({
    initialStatus: view.status === "done" ? "done" : "pending",
    optimisticHideWhenDone: optimisticHideWhenDone && !isCanceled,
    toggleAction: (next) =>
      view.toggle
        ? setNoticeStatusAction({ id: view.toggle.id, version: view.toggle.version, status: next })
        : Promise.resolve({ ok: false as const, error: { code: "NOT_FOUND" } }),
    onSuccess: (previousStatus, nextStatus) => {
      setError("");
      onStatusSuccess?.(entry, previousStatus, nextStatus);
    },
    onError: (actionError) => setError(toggleErrorMessage(actionError)),
  });

  // O estado otimista manda nos dois sentidos: reabrir precisa devolver o
  // badge de urgência na hora, e não só depois que o servidor responder.
  const due = getViewDueBadge({
    ...view,
    status: view.status === "canceled" ? "canceled" : isDone ? "done" : "pending",
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
            !isCanceled && !isDone ? surface : "border-border bg-card",
            isDone && "opacity-70",
          )}
        >
          <div className="flex items-start gap-3">
            {view.toggle ? (
              <Button
                size="icon"
                variant={isDone ? "secondary" : "outline"}
                className={cn(
                  "size-11 shrink-0 rounded-2xl",
                  isDone
                    ? "bg-chart-2/20 text-foreground hover:bg-chart-2/30"
                    : "border-foreground/20 bg-background/60 hover:bg-background",
                )}
                aria-label={`${isDone ? "Reabrir" : "Marcar como feito em casa"}: ${view.title}`}
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
                  {view.profileName}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium text-foreground",
                    presentation.surface,
                  )}
                >
                  <TypeIcon className="size-3.5" aria-hidden />
                  {ACTIVITY_TYPE_LABELS[view.type]}
                </span>
              </div>

              <Link
                href={view.detailHref}
                className={cn(
                  "mt-2 block break-words text-base font-semibold leading-relaxed hover:underline",
                  (isCanceled || isDone) && "text-muted-foreground line-through",
                )}
              >
                {view.title}
              </Link>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant={due.variant}>{due.label}</Badge>
                {view.shared ? (
                  <Badge variant="outline" className="font-normal">
                    Compartilhada
                  </Badge>
                ) : null}
                {view.isExtra ? (
                  <Badge variant="outline" className="font-normal">
                    <Sparkles className="mr-1 size-3" aria-hidden />
                    Extra
                  </Badge>
                ) : null}
              </div>

              {view.subjectName || view.contextLine ? (
                <p className="mt-2 break-words text-xs font-medium text-foreground/80">
                  {[view.subjectName, view.contextLine].filter(Boolean).join(" · ")}
                </p>
              ) : null}

              {view.description ? (
                <p
                  className={cn(
                    "mt-2 whitespace-pre-wrap break-words text-sm text-foreground/90",
                    isDone && "text-muted-foreground line-through",
                  )}
                >
                  {view.description}
                </p>
              ) : null}

              {view.location ? (
                <p className="mt-1 break-words text-xs text-foreground/80">{view.location}</p>
              ) : null}
              {view.assignment ? (
                <p className="mt-1 break-words text-xs text-foreground/80">{view.assignment}</p>
              ) : null}
              {view.provenance ? (
                <p className="mt-1 text-xs text-foreground/80">{view.provenance}</p>
              ) : null}

              {view.version !== null && view.version > 1 ? (
                <Link
                  href={view.detailHref}
                  className="mt-2 block text-xs font-semibold text-primary underline"
                >
                  Atualizada · versão {view.version} · ver antes e depois
                </Link>
              ) : null}
            </div>

            {view.manage ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0 rounded-2xl"
                    aria-label={`Ações para ${view.title}`}
                  >
                    <MoreVertical className="size-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={view.detailHref}>
                      <Pencil className="mr-2 size-4" aria-hidden />
                      Editar
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => setConfirmCancel(true)}
                  >
                    <Trash2 className="mr-2 size-4" aria-hidden />
                    Cancelar atividade
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>

          {/* Confirmar antes de cancelar, aqui mesmo: o menu abre e fecha no
              card, e mandar a pessoa para outra tela só para confirmar faria
              perder o lugar na lista. */}
          {confirmCancel && view.toggle ? (
            <div className="mt-3 space-y-3 rounded-lg border border-destructive/30 p-3">
              <p className="text-sm">
                Cancelar esta atividade? Ela sai das pendências e deixa de gerar lembretes; o
                histórico fica.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={canceling}
                  onClick={() => {
                    const target = view.toggle;
                    if (!target) return;
                    startCancel(async () => {
                      const result = await catchActionResult(() =>
                        setNoticeStatusAction({
                          id: target.id,
                          version: target.version,
                          status: "canceled",
                        }),
                      );
                      setConfirmCancel(false);
                      if (!result.ok) {
                        setError(toggleErrorMessage(result.error));
                        return;
                      }
                      setError("");
                      router.refresh();
                    });
                  }}
                >
                  Confirmar cancelamento
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(false)}>
                  Voltar
                </Button>
              </div>
            </div>
          ) : null}

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
