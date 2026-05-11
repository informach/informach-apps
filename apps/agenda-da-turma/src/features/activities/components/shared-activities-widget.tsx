"use client";

import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import { toast } from "@informach/ui/components/sonner";
import { Check, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { getSubjectIconClassByIndex } from "@/features/subjects/utils";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { respondSharedActivityAction } from "../actions";
import type { PendingSharedActivity } from "../types";
import {
  formatTurmaShort,
  getActivityTypeIcon,
  getActivityTypeLabel,
  getDueBadgeLabel,
  getDueBadgeVariant,
  getDueUrgency,
} from "../utils";

type Props = {
  items: PendingSharedActivity[];
};

export function SharedActivitiesWidget({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <Card className="border-secondary/40 bg-gradient-to-br from-secondary/10 via-secondary/5 to-chart-3/10">
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          {items.length === 1
            ? "1 atividade compartilhada"
            : `${items.length} atividades compartilhadas`}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Outras famílias da turma cadastraram essas atividades. Aceite pra adicionar aos seus
          perfis ativos na turma, ou rejeite se não se aplica.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <SharedActivityItem key={item.activityId} item={item} />
        ))}
      </CardContent>
    </Card>
  );
}

function SharedActivityItem({ item }: { item: PendingSharedActivity }) {
  const router = useRouter();
  const [pendingValue, setPendingValue] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();
  const TypeIcon = getActivityTypeIcon(item.type);

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
          toast.error("Você precisa estar na turma pra responder.");
        } else {
          toast.error("Não foi possível responder.");
        }
        router.refresh();
        return;
      }
      toast.success(accepted ? "Atividade aceita" : "Atividade rejeitada");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-background p-3 sm:flex-row sm:items-start">
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${getSubjectIconClassByIndex(item.subjectColorIndex)}`}
      >
        <TypeIcon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="break-words text-sm font-semibold">
          <Badge variant="secondary" className="mr-2 align-middle">
            {getActivityTypeLabel(item.type)}
          </Badge>
          {item.title}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(() => {
            // Atividade compartilhada pendente nunca tem status — usa "pending"
            // pra calcular urgência baseada só na data de entrega.
            const urgency = getDueUrgency(item.dueAt, "pending");
            return (
              <Badge variant={getDueBadgeVariant(urgency)}>
                {getDueBadgeLabel(item.dueAt, urgency)}
              </Badge>
            );
          })()}
        </div>
        <p className="text-xs text-muted-foreground">
          {item.subjectName} · {formatTurmaShort(item.grade, item.classLetter, item.year)}
        </p>
        <p className="text-xs text-muted-foreground">
          Compartilhada por {item.createdByUserName ?? "outro responsável"}
        </p>
        {item.description ? (
          <p className="text-xs text-foreground/80 whitespace-pre-wrap">{item.description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => handleRespond(true)}
          disabled={pending}
        >
          {pending && pendingValue === true ? (
            <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden />
          ) : (
            <Check className="mr-1 size-3.5" aria-hidden />
          )}
          Aceitar
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleRespond(false)}
          disabled={pending}
        >
          {pending && pendingValue === false ? (
            <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden />
          ) : (
            <X className="mr-1 size-3.5" aria-hidden />
          )}
          Rejeitar
        </Button>
      </div>
    </div>
  );
}
