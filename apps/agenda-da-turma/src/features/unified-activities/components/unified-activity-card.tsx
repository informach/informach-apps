"use client";

import { Badge } from "@informach/ui/components/badge";
import { Card, CardContent } from "@informach/ui/components/card";
import { Checkbox } from "@informach/ui/components/checkbox";
import { Label } from "@informach/ui/components/label";
import { toast } from "@informach/ui/components/sonner";
import { cn } from "@informach/ui/lib/utils";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ActivityCard } from "@/features/activities/components/activity-card";
import type { TurmaWithSubjectsForForm } from "@/features/activities/types";
import {
  getActivityTypeIcon,
  getActivityTypeLabel,
  getDueBadgeLabel,
  getDueBadgeVariant,
  getDueUrgency,
} from "@/features/activities/utils";
import { setProfileSubjectActivityStatusAction } from "@/features/profile-subject-activities/actions";
import {
  getSubjectIconClassByIndex,
  getSubjectTintedClassByIndex,
} from "@/features/subjects/utils";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import type { UnifiedActivityListItem } from "../types";

type Props = {
  item: UnifiedActivityListItem;
  currentUserId: string;
  isPro: boolean;
  turmasForForm: TurmaWithSubjectsForForm[];
  /**
   * Esconde o dropdown de ações (editar/excluir). Dashboard usa `true` — o
   * card é uma vista panorâmica; edições acontecem na página específica.
   */
  hideActions?: boolean;
  /**
   * Dashboard só mostra buckets pendentes. Ao concluir, remove o item localmente
   * enquanto a Server Action refresca a rota.
   */
  optimisticHideWhenDone?: boolean;
};

// Despacha o card correto baseado no `source`. Mantém ActivityCard intacto
// pra atividades de turma (todos os recursos: shared, edit, delete, etc).
// Renderiza um card compatível visualmente pras extras (mesma paleta
// chart-N, ícone do tipo, badge de urgência) com badge "Extra" pra
// diferenciar a origem.
export function UnifiedActivityCard({
  item,
  currentUserId,
  isPro,
  turmasForForm,
  hideActions,
  optimisticHideWhenDone = false,
}: Props) {
  if (item.source === "turma") {
    return (
      <ActivityCard
        item={item}
        currentUserId={currentUserId}
        isPro={isPro}
        turmasForForm={turmasForForm}
        hideActions={hideActions}
        optimisticHideWhenDone={optimisticHideWhenDone}
      />
    );
  }
  return <UnifiedExtraActivityCard item={item} optimisticHideWhenDone={optimisticHideWhenDone} />;
}

function UnifiedExtraActivityCard({
  item,
  optimisticHideWhenDone,
}: {
  item: Extract<UnifiedActivityListItem, { source: "extra" }>;
  optimisticHideWhenDone: boolean;
}) {
  const router = useRouter();
  const [optimisticStatus, setOptimisticStatus] = useState(item.status);
  const [optimisticallyHidden, setOptimisticallyHidden] = useState(false);
  const [pending, startTransition] = useTransition();
  const TypeIcon = getActivityTypeIcon(item.type);
  const isDone = optimisticStatus === "done";
  const urgency = getDueUrgency(item.dueAt, optimisticStatus);
  const checkboxId = `extra-status-${item.activityId}`;

  useEffect(() => {
    setOptimisticStatus(item.status);
    setOptimisticallyHidden(false);
  }, [item.status]);

  const handleToggle = (next: boolean) => {
    const previousStatus = optimisticStatus;
    const nextStatus = next ? "done" : "pending";

    setOptimisticStatus(nextStatus);
    if (optimisticHideWhenDone && nextStatus === "done") {
      setOptimisticallyHidden(true);
    }

    startTransition(async () => {
      const result = await catchActionResult(() =>
        setProfileSubjectActivityStatusAction({
          id: item.activityId,
          status: nextStatus,
        }),
      );
      if (!result.ok) {
        setOptimisticStatus(previousStatus);
        setOptimisticallyHidden(false);
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível atualizar.", {
            description: "Atualize a página e tente novamente.",
          });
        } else if (result.error.code === "NOT_FOUND") {
          toast.error("Atividade não encontrada");
        } else {
          toast.error("Não foi possível atualizar.");
        }
        router.refresh();
        return;
      }
    });
  };

  if (optimisticallyHidden) return null;

  return (
    <Card
      className={cn(
        getSubjectTintedClassByIndex(item.profileSubjectColorIndex),
        isDone && "opacity-70",
      )}
    >
      <CardContent className="flex items-start gap-3 p-4">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full",
            getSubjectIconClassByIndex(item.profileSubjectColorIndex),
          )}
        >
          <TypeIcon className="size-5" aria-hidden />
        </span>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div
            className={cn(
              "break-words text-base font-semibold text-foreground",
              isDone && "text-muted-foreground line-through",
            )}
          >
            <Badge variant="secondary" className="mr-2 align-middle">
              {getActivityTypeLabel(item.type)}
            </Badge>
            {item.title}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={getDueBadgeVariant(urgency)}>
              {getDueBadgeLabel(item.dueAt, urgency)}
            </Badge>
            <Badge variant="outline" className="font-normal">
              <Sparkles className="mr-1 size-3" aria-hidden />
              Extra
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {item.profileSubjectName} · extracurricular
          </p>
          {item.description ? (
            <p
              className={cn(
                "whitespace-pre-wrap break-words text-sm text-foreground/90",
                isDone && "text-muted-foreground line-through",
              )}
            >
              {item.description}
            </p>
          ) : null}
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id={checkboxId}
              checked={isDone}
              onCheckedChange={(value) => handleToggle(value === true)}
              disabled={pending}
              aria-label={
                isDone
                  ? `Marcar "${item.title}" como pendente`
                  : `Marcar "${item.title}" como concluída`
              }
            />
            <Label htmlFor={checkboxId} className="cursor-pointer text-sm font-medium">
              {item.studentProfileName}
            </Label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
