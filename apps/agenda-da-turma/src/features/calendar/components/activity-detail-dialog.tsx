"use client";

import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import { Checkbox } from "@informach/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@informach/ui/components/dialog";
import { Label } from "@informach/ui/components/label";
import { toast } from "@informach/ui/components/sonner";
import { cn } from "@informach/ui/lib/utils";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setActivityStatusAction } from "@/features/activities/actions";
import { ActivityFormDialog } from "@/features/activities/components/activity-form-dialog";
import { DeleteActivityDialog } from "@/features/activities/components/delete-activity-dialog";
import type { ActivityListItem, TurmaWithSubjectsForForm } from "@/features/activities/types";
import {
  canEditActivity,
  formatTurmaShort,
  getActivityTypeIcon,
  getActivityTypeLabel,
  getDueBadgeLabel,
  getDueBadgeVariant,
  getDueUrgency,
} from "@/features/activities/utils";
import { getSubjectIconClassByIndex } from "@/features/subjects/utils";
import { catchActionResult, isActionRejected } from "@/lib/action-result";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ActivityListItem | null;
  currentUserId: string;
  isPro: boolean;
  turmasForForm: TurmaWithSubjectsForForm[];
};

// Modal de detalhe disparada ao clicar num blip. Layout próprio (não reuso
// do ActivityCard) — hierarquia visual diferente: título em destaque, lugar
// pra descrição em prose, ações primárias visíveis. Edit/Delete abrem
// ActivityFormDialog e DeleteActivityDialog como sub-dialogs (Radix lida
// com aninhamento; o detail fica aberto enquanto o sub-dialog é
// interagido).
export function ActivityDetailDialog({
  open,
  onOpenChange,
  item,
  currentUserId,
  isPro,
  turmasForForm,
}: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Item null durante closing — não renderiza nada além do Dialog vazio.
  if (!item) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="hidden" />
      </Dialog>
    );
  }

  const TypeIcon = getActivityTypeIcon(item.type);
  const isDone = item.status === "done";
  const urgency = getDueUrgency(item.dueAt, item.status);
  const canManage = canEditActivity(item, currentUserId);

  const handleToggle = (next: boolean) => {
    startTransition(async () => {
      const result = await catchActionResult(() =>
        setActivityStatusAction({
          activityId: item.activityId,
          studentProfileId: item.studentProfileId,
          status: next ? "done" : "pending",
        }),
      );
      if (!result.ok) {
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
      router.refresh();
    });
  };

  const checkboxId = `detail-status-${item.statusId}`;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader className="space-y-3">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-full",
                  getSubjectIconClassByIndex(item.subjectColorIndex),
                )}
              >
                <TypeIcon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">{getActivityTypeLabel(item.type)}</Badge>
                  {item.visibility === "shared_with_turma" ? (
                    <Badge variant="outline" className="font-normal">
                      Compartilhada
                    </Badge>
                  ) : null}
                </div>
                <DialogTitle
                  className={cn(
                    "text-left text-xl leading-tight",
                    isDone && "text-muted-foreground line-through",
                  )}
                >
                  {item.title}
                </DialogTitle>
                <DialogDescription className="mt-1 text-left">
                  {item.subjectName} · {formatTurmaShort(item.grade, item.classLetter, item.year)} ·{" "}
                  {item.schoolName}
                </DialogDescription>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getDueBadgeVariant(urgency)}>
                {getDueBadgeLabel(item.dueAt, urgency)}
              </Badge>
              <Badge variant="outline" className="font-normal">
                {item.studentProfileName}
              </Badge>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {item.description ? (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Observação
                </p>
                <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">
                  {item.description}
                </p>
              </div>
            ) : (
              <p className="text-sm italic text-muted-foreground">Sem observação cadastrada.</p>
            )}

            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-3">
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
                {isDone
                  ? `Concluída por ${item.studentProfileName}`
                  : `Marcar como concluída para ${item.studentProfileName}`}
              </Label>
            </div>
          </div>

          <DialogFooter className="flex-row flex-wrap gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {canManage ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                    <Pencil className="mr-1 size-4" aria-hidden />
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="mr-1 size-4" aria-hidden />
                    Excluir
                  </Button>
                </>
              ) : null}
            </div>
            <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canManage ? (
        <>
          <ActivityFormDialog
            open={editOpen}
            onOpenChange={(next) => {
              setEditOpen(next);
              // Depois de salvar, fecha o detail também — o item pode ter
              // mudado (tipo, título, dueAt) e o detail "antigo" fica stale.
              if (!next) onOpenChange(false);
            }}
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
            onOpenChange={(next) => {
              setDeleteOpen(next);
              if (!next) onOpenChange(false);
            }}
            activityId={item.activityId}
            activityTitle={item.title}
          />
        </>
      ) : null}
    </>
  );
}
