"use client";

import { Button } from "@informach/ui/components/button";
import { toast } from "@informach/ui/components/sonner";
import { cn } from "@informach/ui/lib/utils";
import { Check, Loader2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DueChip } from "@/features/unified-activities/components/due-chip";
import { describeDue } from "@/features/unified-activities/due";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { acceptAllSharedActivitiesAction, respondSharedActivityAction } from "../actions";
import type { PendingSharedActivity } from "../types";
import { formatTurmaShort, getActivityTypeIcon, getActivityTypeLabel } from "../utils";

type Props = {
  items: PendingSharedActivity[];
};

const DOT_CLASS: Record<number, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
};

/**
 * O que outra família da turma mandou, esperando um sim.
 *
 * Era um cartão em degradê com selo de tipo e selo de prazo pintados, no fim
 * de Hoje, sempre aberto. Virou uma linha ("2 atividades da turma do 3º ano B
 * esperando você"), que abre as mesmas linhas da agenda: o título, a matéria
 * pelo ponto da cor, quem mandou e, à direita, quando é.
 */
export function SharedActivitiesWidget({ items }: Props) {
  if (items.length === 0) return null;
  const turmas = new Set(items.map((item) => turmaLabel(item)));
  const where = turmas.size === 1 ? `da turma do ${[...turmas][0]}` : "das turmas";

  return (
    <details className="group overflow-hidden rounded-[20px] border border-foreground/15 bg-background">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <Users className="size-5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 text-[15px] leading-snug">
          <strong>
            {items.length === 1 ? "Uma atividade" : `${items.length} atividades`} {where}
          </strong>{" "}
          esperando você
        </span>
        <span className="shrink-0 text-sm font-bold text-primary-ink group-open:hidden">Ver</span>
        <span className="hidden shrink-0 text-sm font-bold text-primary-ink group-open:inline">
          Fechar
        </span>
      </summary>
      <ul>
        <li className="border-t border-foreground/15 px-4 py-3 text-sm text-muted-foreground sm:px-5">
          Outra família da turma mandou. Aceitar põe na agenda das suas crianças dessa turma.
        </li>
        {items.length > 1 ? (
          <li>
            <AcceptAllSharedActivities count={items.length} />
          </li>
        ) : null}
        {items.map((item) => (
          <li key={item.activityId}>
            <SharedActivityItem item={item} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function turmaLabel(item: Pick<PendingSharedActivity, "grade" | "classLetter">) {
  return `${item.grade.replace(/[^0-9]/g, "")}º ano ${item.classLetter}`;
}

/**
 * Uma turma ativa manda várias atividades de uma vez, e responder uma a uma é
 * o atrito que faz a família deixar a seção para depois, e depois é quando o
 * prazo já passou. O botão por item continua, para quem quer escolher.
 */
function AcceptAllSharedActivities({ count }: { count: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-foreground/15 px-4 py-3 sm:px-5">
      <p className="text-sm text-muted-foreground">Todas são da turma das suas crianças.</p>
      <Button
        type="button"
        className="min-h-11 shrink-0 rounded-xl font-bold"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await catchActionResult(() => acceptAllSharedActivitiesAction({}));
            if (!result.ok) {
              toast.error("Não foi possível aceitar todas.", {
                description: "Atualize a página e tente novamente.",
              });
              router.refresh();
              return;
            }
            const { accepted, skipped, remaining } = result.value;
            const leftOver = [
              skipped ? `${skipped} não puderam ser aceitas` : null,
              remaining ? `${remaining} ficaram para o próximo toque` : null,
            ]
              .filter(Boolean)
              .join(" e ");
            if (accepted)
              toast.success(
                accepted === 1 ? "1 atividade aceita" : `${accepted} atividades aceitas`,
                leftOver ? { description: `${leftOver}.` } : undefined,
              );
            else toast.error("Nenhuma pôde ser aceita agora.");
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden /> : null}
        Aceitar todas ({count})
      </Button>
    </div>
  );
}

function SharedActivityItem({ item }: { item: PendingSharedActivity }) {
  const router = useRouter();
  const [pendingValue, setPendingValue] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();
  const TypeIcon = getActivityTypeIcon(item.type);
  // Atividade compartilhada pendente não tem situação própria: o chip sai só da data.
  const due = describeDue({ dueAt: item.dueAt, time: null, status: "pending" });

  const handleRespond = (accepted: boolean) => {
    setPendingValue(accepted);
    startTransition(async () => {
      const result = await catchActionResult(() =>
        respondSharedActivityAction({ activityId: item.activityId, accepted }),
      );
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível responder.", {
            description: "Atualize a página e tente novamente.",
          });
        } else if (result.error.code === "NOT_FOUND") {
          toast.error("Atividade não encontrada", {
            description: "Pode ter sido removida.",
          });
        } else if (result.error.code === "FORBIDDEN") {
          toast.error("Você criou essa atividade, então já está na sua agenda.");
        } else if (result.error.code === "NOT_SHARED") {
          toast.error("Essa atividade não é compartilhada.");
        } else if (result.error.code === "NOT_A_MEMBER") {
          toast.error("Você precisa estar na turma para responder.");
        } else if (result.error.code === "DUE_DATE_PASSED") {
          toast.error("O prazo dessa atividade já passou.", {
            description: "Atividades vencidas não podem mais ser aceitas.",
          });
        } else {
          toast.error("Não foi possível responder.");
        }
        router.refresh();
        return;
      }
      toast.success(accepted ? "Atividade aceita" : "Pronto, ela não entra na sua agenda.");
      router.refresh();
    });
  };

  return (
    <div className="border-t border-foreground/15 px-4 py-3 sm:px-5">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-foreground/15">
          <TypeIcon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="break-words text-[15px] font-bold leading-snug">{item.title}</p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
            <span
              aria-hidden
              className={cn(
                "size-2 shrink-0 rounded-full",
                DOT_CLASS[item.subjectColorIndex] ?? "bg-foreground/70",
              )}
            />
            <span>{item.subjectName}</span>
            <span aria-hidden>·</span>
            <span>{getActivityTypeLabel(item.type)}</span>
            <span aria-hidden>·</span>
            <span>{formatTurmaShort(item.grade, item.classLetter, item.year)}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Mandada por {item.createdByUserName ?? "outra família"}
          </p>
          {item.description ? (
            <p className="whitespace-pre-wrap break-words text-sm text-foreground/80">
              {item.description}
            </p>
          ) : null}
        </div>
        <DueChip due={due} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2 pl-14">
        <Button
          type="button"
          className="min-h-11 rounded-xl font-bold"
          onClick={() => handleRespond(true)}
          disabled={pending}
        >
          {pending && pendingValue === true ? (
            <Loader2 className="mr-1 size-4 animate-spin" aria-hidden />
          ) : (
            <Check className="mr-1 size-4" aria-hidden />
          )}
          Aceitar
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-xl"
          onClick={() => handleRespond(false)}
          disabled={pending}
        >
          {pending && pendingValue === false ? (
            <Loader2 className="mr-1 size-4 animate-spin" aria-hidden />
          ) : null}
          Não é para nós
        </Button>
      </div>
    </div>
  );
}
