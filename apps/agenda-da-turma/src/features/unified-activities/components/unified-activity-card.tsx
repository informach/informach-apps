"use client";

import { Button } from "@informach/ui/components/button";
import { toast } from "@informach/ui/components/sonner";
import { cn } from "@informach/ui/lib/utils";
import { Check, RotateCcw, Users, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { noticeErrorMessage } from "@/features/notices/messages";
import { submitTaskStatus } from "@/features/offline-queue/client";
import { QueuedBadge } from "@/features/offline-queue/components/queued-badge";
import { useQueueOwner } from "@/features/offline-queue/owner";
import { isActionRejected } from "@/lib/action-result";
import { ACTIVITY_TYPE_LABELS } from "../activity-types";
import { describeDue } from "../due";
import { useCardToggle } from "../hooks/use-card-toggle";
import type { ActivityOverviewItem } from "../overview-types";
import { toActivityView } from "../view";
import { DueChip } from "./due-chip";

type Props = {
  entry: ActivityOverviewItem;
  currentUserId: string;
  /** Nos buckets da rotina o item some ao ser concluído, com colapso animado. */
  optimisticHideWhenDone?: boolean;
  /** À noite, dentro da mochila de cada criança, a linha não leva o chip do dia. */
  hideChip?: boolean;
  /** Na folha de uma criança, o nome dela já está no topo: a linha não repete. */
  hideProfile?: boolean;
  onStatusSuccess?: (
    entry: ActivityOverviewItem,
    previousStatus: "pending" | "done",
    nextStatus: "pending" | "done",
  ) => void;
};

const DOT_CLASS: Record<number, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
};

/** Lembrado por aparelho: a explicação longa aparece no primeiro Feito, depois fica curta. */
const FIRST_DONE_KEY = "agenda:first-done-explained";

function toggleErrorMessage(error: { code: string }): string {
  if (isActionRejected(error))
    return "Não foi possível atualizar. Atualize a página e tente de novo.";
  return noticeErrorMessage(error.code);
}

function firstDoneMessage() {
  try {
    if (window.localStorage.getItem(FIRST_DONE_KEY)) return "Feito.";
    window.localStorage.setItem(FIRST_DONE_KEY, "1");
  } catch {
    // Sem armazenamento, a explicação aparece sempre: melhor repetir do que omitir.
  }
  return "Marcado aqui. A escola não recebe aviso.";
}

/**
 * Uma atividade, uma linha da agenda. É o único card do app: a rotina, a lista
 * de Atividades e a vista rápida do mês usam este componente.
 *
 * Como no canvas, ele diz três coisas: o título (que abre o detalhe), a
 * matéria pelo ponto da cor e pelo nome, a criança (e "na próxima aula" quando
 * a data veio do horário), e, à direita, quando é. Editar e cancelar moram no
 * detalhe, a um toque: o menu de três pontos que ficava em cada linha saiu.
 *
 * O alvo de concluir continua de 44 px e só habilita depois de hidratar
 * (`ready`); o estado "sobe quando a rede voltar" continua visível; concluir
 * passa pela rota idempotente da fila offline.
 */
export function UnifiedActivityCard({
  entry,
  currentUserId,
  optimisticHideWhenDone = false,
  hideChip = false,
  hideProfile = false,
  onStatusSuccess,
}: Props) {
  const view = toActivityView(entry, currentUserId);
  const [error, setError] = useState("");
  const queueOwner = useQueueOwner();
  // Em Hoje a linha concluída sai da lista no refresh, e o "Desfazer" do aviso
  // roda com o card já desmontado: um erro ali precisa de outro lugar para
  // aparecer além da própria linha.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const isCanceled = view.status === "canceled";

  const { ready, isDone, isExiting, optimisticallyHidden, pending, queued, handleToggle, retry } =
    useCardToggle({
      initialStatus: view.status === "done" ? "done" : "pending",
      version: view.toggle?.version,
      taskId: view.toggle?.id,
      optimisticHideWhenDone: optimisticHideWhenDone && !isCanceled,
      // Concluir e reabrir passam pela rota idempotente, não pela server action:
      // é o único caminho que sobrevive a uma rede que sumiu no meio, porque a
      // chave de idempotência deixa o aparelho repetir sem gravar duas vezes.
      toggleAction: (next, version) =>
        view.toggle
          ? submitTaskStatus({
              id: view.toggle.id,
              version: version ?? view.toggle.version,
              status: next,
              title: view.title,
              userId: queueOwner,
            })
          : Promise.resolve({ ok: false as const, error: { code: "NOT_FOUND" } }),
      onSuccess: (previousStatus, nextStatus) => {
        setError("");
        onStatusSuccess?.(entry, previousStatus, nextStatus);
        if (nextStatus === "done")
          toast(firstDoneMessage(), {
            action: { label: "Desfazer", onClick: () => handleToggle(false) },
          });
      },
      onError: (actionError) => {
        const message = toggleErrorMessage(actionError);
        if (mounted.current) setError(message);
        else toast.error(message);
      },
    });

  // O estado otimista manda nos dois sentidos: reabrir precisa devolver o
  // prazo na hora, e não só depois que o servidor responder.
  const due = describeDue({
    dueAt: view.dueAt,
    time: view.time,
    status: isCanceled ? "canceled" : isDone ? "done" : "pending",
  });

  if (optimisticallyHidden) return null;

  const meta = [
    view.subjectName ?? ACTIVITY_TYPE_LABELS[view.type],
    hideProfile ? null : view.profileName,
    view.isExtra ? "fora da escola" : null,
    entry.item.dateOrigin === "schedule" ? "na próxima aula" : null,
    view.assignedName ? `${view.assignedName} cuida` : null,
  ].filter(Boolean);

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
        <article className="border-t border-foreground/15 py-2.5 pl-2 pr-3.5 lg:pl-3 lg:pr-5">
          <div className="flex min-h-11 items-center gap-3 lg:gap-3.5">
            {view.toggle ? (
              <button
                type="button"
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-full outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                )}
                aria-label={`${isDone ? "Reabrir" : "Marcar como feito"}: ${view.title}`}
                disabled={!ready || pending}
                onClick={() => handleToggle(!isDone)}
              >
                {isDone ? (
                  <span className="flex size-6 items-center justify-center rounded-full bg-chart-2 text-background">
                    <Check className="size-4" strokeWidth={3} aria-hidden />
                  </span>
                ) : (
                  <span className="size-6 rounded-full border-2 border-foreground/35" />
                )}
              </button>
            ) : (
              <span className="flex size-11 shrink-0 items-center justify-center" aria-hidden>
                <X className="size-4 text-muted-foreground" />
              </span>
            )}

            <div className="min-w-0 flex-1">
              <Link
                href={view.detailHref}
                className={cn(
                  "block break-words text-base font-bold leading-snug hover:underline",
                  (isCanceled || isDone) && "text-muted-foreground line-through",
                )}
              >
                {view.title}
              </Link>
              {/* Texto corrido, e não flex com quebra: com flex o texto inteiro
                  descia de linha e deixava o ponto sozinho em cima. */}
              <p className="mt-[3px] break-words text-[13px] font-medium leading-snug text-muted-foreground">
                {view.subjectName ? (
                  <span
                    aria-hidden
                    className={cn(
                      "mr-1.5 inline-block size-[9px] rounded-full align-[0px]",
                      view.subjectColorIndex !== null
                        ? DOT_CLASS[view.subjectColorIndex]
                        : "bg-foreground/60",
                    )}
                  />
                ) : null}
                {meta.join(" · ")}
                {view.shared ? (
                  <span className="whitespace-nowrap">
                    {" · "}
                    <Users className="mr-0.5 inline size-3.5 align-[-2px]" aria-hidden />
                    turma
                  </span>
                ) : null}
              </p>
              {queued ? <QueuedBadge className="mt-1.5 font-normal" /> : null}
              {view.editedAfterSave && !isDone ? (
                <Link
                  href={`${view.detailHref}?historico=1#historico`}
                  className="inline-flex min-h-11 items-center text-xs font-semibold text-primary-ink underline"
                >
                  Mudou depois de salva · ver o que mudou
                </Link>
              ) : null}
            </div>

            {hideChip ? null : <DueChip due={due} />}
          </div>

          {error ? (
            <div role="alert" className="mb-1 ml-12 mt-1 flex flex-wrap items-center gap-2">
              <p className="text-sm text-destructive-ink">{error}</p>
              {retry ? (
                <Button size="sm" variant="outline" disabled={pending} onClick={retry}>
                  <RotateCcw className="mr-1.5 size-3.5" aria-hidden />
                  Tentar de novo
                </Button>
              ) : null}
            </div>
          ) : null}
        </article>
      </div>
    </div>
  );
}
