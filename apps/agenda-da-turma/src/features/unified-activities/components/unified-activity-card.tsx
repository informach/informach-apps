"use client";

import { Badge } from "@informach/ui/components/badge";
import { Card, CardContent } from "@informach/ui/components/card";
import { Checkbox } from "@informach/ui/components/checkbox";
import { Label } from "@informach/ui/components/label";
import { toast } from "@informach/ui/components/sonner";
import { cn } from "@informach/ui/lib/utils";
import { Sparkles } from "lucide-react";
import { ActivityCard } from "@/features/activities/components/activity-card";
import type { ActivityStatusValue, TurmaWithSubjectsForForm } from "@/features/activities/types";
import {
  getActivityTypeIcon,
  getActivityTypeLabel,
  getDueBadgeLabel,
  getDueBadgeVariant,
  getDueUrgency,
} from "@/features/activities/utils";
import { RoutineCard } from "@/features/notices/components/routine-card";
import { setProfileSubjectActivityStatusAction } from "@/features/profile-subject-activities/actions";
import {
  getSubjectIconClassByIndex,
  getSubjectTintedClassByIndex,
} from "@/features/subjects/utils";
import { isActionRejected } from "@/lib/action-result";
import { useCardToggle } from "../hooks/use-card-toggle";
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
   * Dashboard só mostra buckets pendentes. Ao concluir, o wrapper anima
   * (collapse + fade) e depois o componente desmonta — `useCardToggle`
   * cuida do timing.
   */
  optimisticHideWhenDone?: boolean;
  onStatusSuccess?: (
    item: UnifiedActivityListItem,
    previousStatus: ActivityStatusValue,
    nextStatus: ActivityStatusValue,
  ) => void;
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
  onStatusSuccess,
}: Props) {
  if (item.source === "notice") return <RoutineCard item={item.routineItem} />;
  if (item.source === "turma") {
    return (
      <ActivityCard
        item={item}
        currentUserId={currentUserId}
        isPro={isPro}
        turmasForForm={turmasForForm}
        hideActions={hideActions}
        optimisticHideWhenDone={optimisticHideWhenDone}
        onStatusSuccess={(activity, previousStatus, nextStatus) =>
          onStatusSuccess?.({ ...activity, source: "turma" }, previousStatus, nextStatus)
        }
      />
    );
  }
  return (
    <UnifiedExtraActivityCard
      item={item}
      optimisticHideWhenDone={optimisticHideWhenDone}
      onStatusSuccess={onStatusSuccess}
    />
  );
}

function UnifiedExtraActivityCard({
  item,
  optimisticHideWhenDone,
  onStatusSuccess,
}: {
  item: Extract<UnifiedActivityListItem, { source: "extra" }>;
  optimisticHideWhenDone: boolean;
  onStatusSuccess?: (
    item: UnifiedActivityListItem,
    previousStatus: ActivityStatusValue,
    nextStatus: ActivityStatusValue,
  ) => void;
}) {
  const { isDone, isExiting, optimisticallyHidden, pending, handleToggle } = useCardToggle({
    initialStatus: item.status,
    optimisticHideWhenDone,
    toggleAction: (next) =>
      setProfileSubjectActivityStatusAction({
        id: item.activityId,
        status: next,
      }),
    onSuccess: (previousStatus, nextStatus) => onStatusSuccess?.(item, previousStatus, nextStatus),
    onError: (error) => {
      if (isActionRejected(error)) {
        toast.error("Não foi possível atualizar.", {
          description: "Atualize a página e tente novamente.",
        });
      } else if (error.code === "NOT_FOUND") {
        toast.error("Atividade não encontrada");
      } else {
        toast.error("Não foi possível atualizar.");
      }
    },
  });

  const TypeIcon = getActivityTypeIcon(item.type);
  const urgency = getDueUrgency(item.dueAt, isDone ? "done" : "pending");
  const checkboxId = `extra-status-${item.activityId}`;

  if (optimisticallyHidden) return null;

  return (
    <div
      className={cn(
        // Wrapper governa entrada (@starting-style) + saída (isExiting).
        // grid-rows-[1fr]→[0fr] colapsa altura suavemente; opacity faz fade.
        // overflow-hidden no filho evita o conteúdo estourar pra fora durante o colapso.
        // motion-reduce honra prefers-reduced-motion (sem animação).
        "grid grid-rows-[1fr] opacity-100",
        "starting:grid-rows-[0fr] starting:opacity-0",
        "transition-all duration-300 ease-out motion-reduce:transition-none",
        "[transition-behavior:allow-discrete]",
        isExiting && "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="overflow-hidden">
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
      </div>
    </div>
  );
}
