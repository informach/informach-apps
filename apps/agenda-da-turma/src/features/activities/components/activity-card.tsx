"use client";

import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import { Card, CardContent } from "@informach/ui/components/card";
import { Checkbox } from "@informach/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@informach/ui/components/dropdown-menu";
import { Label } from "@informach/ui/components/label";
import { toast } from "@informach/ui/components/sonner";
import { cn } from "@informach/ui/lib/utils";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  getSubjectIconClassByIndex,
  getSubjectTintedClassByIndex,
} from "@/features/subjects/utils";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { setActivityStatusAction } from "../actions";
import type { ActivityListItem, TurmaWithSubjectsForForm } from "../types";
import {
  canEditActivity,
  formatTurmaShort,
  getActivityTypeIcon,
  getActivityTypeLabel,
  getDueBadgeLabel,
  getDueBadgeVariant,
  getDueUrgency,
} from "../utils";
import { ActivityFormDialog } from "./activity-form-dialog";
import { DeleteActivityDialog } from "./delete-activity-dialog";

type Props = {
  item: ActivityListItem;
  currentUserId: string;
  isPro: boolean;
  turmasForForm: TurmaWithSubjectsForForm[];
  /**
   * Esconde o dropdown de ações (editar/excluir). Usado no dashboard, onde
   * o card é uma vista panorâmica e edições acontecem em /atividades.
   */
  hideActions?: boolean;
  /**
   * Dashboard só mostra buckets pendentes. Ao concluir, remove o item localmente
   * enquanto a Server Action refresca a rota.
   */
  optimisticHideWhenDone?: boolean;
};

export function ActivityCard({
  item,
  currentUserId,
  isPro,
  turmasForForm,
  hideActions = false,
  optimisticHideWhenDone = false,
}: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState(item.status);
  const [optimisticallyHidden, setOptimisticallyHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  const TypeIcon = getActivityTypeIcon(item.type);
  const isDone = optimisticStatus === "done";
  const urgency = getDueUrgency(item.dueAt, optimisticStatus);
  const checkboxId = `activity-status-${item.statusId}`;

  useEffect(() => {
    setOptimisticStatus(item.status);
    setOptimisticallyHidden(false);
  }, [item.status]);

  // Só o criador edita/deleta. E se foi compartilhada e alguém aceitou, mesmo
  // o criador fica trancado. Service aplica a regra também — UI só esconde.
  const canManage = !hideActions && canEditActivity(item, currentUserId);

  const handleToggle = (next: boolean) => {
    const previousStatus = optimisticStatus;
    const nextStatus = next ? "done" : "pending";

    setOptimisticStatus(nextStatus);
    if (optimisticHideWhenDone && nextStatus === "done") {
      setOptimisticallyHidden(true);
    }

    startTransition(async () => {
      const result = await catchActionResult(() =>
        setActivityStatusAction({
          activityId: item.activityId,
          studentProfileId: item.studentProfileId,
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
        } else if (result.error.code === "INVALID_PROFILE") {
          toast.error("Esse perfil não é seu");
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
    <>
      <Card
        className={cn(getSubjectTintedClassByIndex(item.subjectColorIndex), isDone && "opacity-70")}
      >
        <CardContent className="flex items-start gap-3 p-4">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-full",
              getSubjectIconClassByIndex(item.subjectColorIndex),
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
              {/* Badge do tipo prepended inline — fica na frente do título e
                  flui com o texto quando ele quebra em várias linhas. */}
              <Badge variant="secondary" className="mr-2 align-middle">
                {getActivityTypeLabel(item.type)}
              </Badge>
              {item.title}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Badge de urgência da entrega — comunica visualmente o estado:
                  destructive (atrasada), warning (hoje/amanhã), default azul
                  (>= depois de amanhã), outline (concluída — neutro). */}
              <Badge variant={getDueBadgeVariant(urgency)}>
                {getDueBadgeLabel(item.dueAt, urgency)}
              </Badge>
              {item.visibility === "shared_with_turma" ? (
                <Badge variant="outline" className="font-normal">
                  Compartilhada
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {item.subjectName} · {formatTurmaShort(item.grade, item.classLetter, item.year)}
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
                    ? `Marcar atividade de ${item.studentProfileName} como pendente`
                    : `Marcar atividade de ${item.studentProfileName} como concluída`
                }
              />
              <Label htmlFor={checkboxId} className="cursor-pointer text-sm font-medium">
                {item.studentProfileName}
              </Label>
            </div>
          </div>

          {canManage ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Ações para ${item.title}`}
                  disabled={pending}
                >
                  <MoreVertical className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                  <Pencil className="mr-2 size-4" aria-hidden />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setDeleteOpen(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 size-4" aria-hidden />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </CardContent>
      </Card>

      {canManage ? (
        <>
          <ActivityFormDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            turmas={turmasForForm}
            isPro={isPro}
            activity={{
              activityId: item.activityId,
              type: item.type,
              title: item.title,
              description: item.description,
              dueAt: item.dueAt,
              turmaId: item.turmaId,
              subjectId: item.subjectId,
              visibility: item.visibility,
              subjectName: item.subjectName,
              schoolName: item.schoolName,
              grade: item.grade,
              classLetter: item.classLetter,
            }}
          />
          <DeleteActivityDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            activityId={item.activityId}
            activityTitle={item.title}
          />
        </>
      ) : null}
    </>
  );
}
