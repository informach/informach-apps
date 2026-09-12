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
import { ExternalLink, Pencil, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setActivityStatusAction } from "@/features/activities/actions";
import { ActivityFormDialog } from "@/features/activities/components/activity-form-dialog";
import { DeleteActivityDialog } from "@/features/activities/components/delete-activity-dialog";
import type { TurmaWithSubjectsForForm } from "@/features/activities/types";
import {
  canEditActivity,
  formatTurmaShort,
  getActivityTypeIcon,
  getActivityTypeLabel,
  getDueBadgeLabel,
  getDueBadgeVariant,
  getDueUrgency,
} from "@/features/activities/utils";
import { RoutineCard } from "@/features/notices/components/routine-card";
import { setProfileSubjectActivityStatusAction } from "@/features/profile-subject-activities/actions";
import { getSubjectIconClassByIndex } from "@/features/subjects/utils";
import type { UnifiedActivityListItem } from "@/features/unified-activities/types";
import { catchActionResult, isActionRejected } from "@/lib/action-result";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  item: UnifiedActivityListItem | null;
  currentUserId: string;
  isPro: boolean;
  turmasForForm: TurmaWithSubjectsForForm[];
};

// Modal de detalhe disparada ao clicar num blip. Ramifica por `source`:
//   - turma → renderiza o detalhe completo com edit/delete inline (mantém
//     o fluxo atual de atividades de turma intacto).
//   - extra → renderiza versão simplificada: toggle de status + link
//     "Abrir matéria" pra /perfis/[id]/extras/[subjectId] onde mora a gestão.
//     Edit/Delete acontecem lá, não no calendário (decisão de produto:
//     calendário é visualização cross-origem, gestão é por contexto).
export function ActivityDetailDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
  item,
  currentUserId,
  isPro,
  turmasForForm,
}: Props) {
  // Item null durante closing — não renderiza nada além do Dialog vazio.
  if (!item) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="hidden" onCloseAutoFocus={onCloseAutoFocus} />
      </Dialog>
    );
  }

  if (item.source === "notice") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle>{item.title}</DialogTitle>
            <DialogDescription>
              Providência de {item.studentProfileName}. Abra o título para conferir a fonte e o
              histórico.
            </DialogDescription>
          </DialogHeader>
          <RoutineCard item={item.routineItem} />
        </DialogContent>
      </Dialog>
    );
  }
  if (item.source === "extra") {
    return (
      <ExtraActivityDetailDialog
        open={open}
        onOpenChange={onOpenChange}
        onCloseAutoFocus={onCloseAutoFocus}
        currentUserId={currentUserId}
        item={item}
      />
    );
  }

  return (
    <TurmaActivityDetailDialog
      open={open}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={onCloseAutoFocus}
      item={item}
      currentUserId={currentUserId}
      isPro={isPro}
      turmasForForm={turmasForForm}
    />
  );
}

function TurmaActivityDetailDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
  item,
  currentUserId,
  isPro,
  turmasForForm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  item: Extract<UnifiedActivityListItem, { source: "turma" }>;
  currentUserId: string;
  isPro: boolean;
  turmasForForm: TurmaWithSubjectsForForm[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

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
        <DialogContent
          className="max-h-[90vh] max-w-lg overflow-y-auto"
          onCloseAutoFocus={onCloseAutoFocus}
        >
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
            {item.canceledAt ? <Badge variant="destructive">Cancelada pelo criador</Badge> : null}
            {(item.version ?? 1) > 1 ? (
              <Link
                href={`/atividades/${item.activityId}/historico`}
                className="block text-sm text-primary underline"
              >
                Alterada · versão {item.version} · ver histórico
              </Link>
            ) : null}
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
                disabled={pending || Boolean(item.canceledAt)}
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
              version: item.version,
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

function ExtraActivityDetailDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
  currentUserId,
  item,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  currentUserId: string;
  item: Extract<UnifiedActivityListItem, { source: "extra" }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const TypeIcon = getActivityTypeIcon(item.type);
  const isDone = item.status === "done";
  const urgency = getDueUrgency(item.dueAt, item.status);
  const checkboxId = `detail-status-extra-${item.activityId}`;

  const handleToggle = (next: boolean) => {
    startTransition(async () => {
      const result = await catchActionResult(() =>
        setProfileSubjectActivityStatusAction({
          id: item.activityId,
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
        } else {
          toast.error("Não foi possível atualizar.");
        }
        router.refresh();
        return;
      }
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-lg overflow-y-auto"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader className="space-y-3">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-full",
                getSubjectIconClassByIndex(item.profileSubjectColorIndex),
              )}
            >
              <TypeIcon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">{getActivityTypeLabel(item.type)}</Badge>
                <Badge variant="outline" className="font-normal">
                  <Sparkles className="mr-1 size-3" aria-hidden />
                  Extra
                </Badge>
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
                {item.profileSubjectName} · extracurricular
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
                  ? `Marcar "${item.title}" como pendente`
                  : `Marcar "${item.title}" como concluída`
              }
            />
            <Label htmlFor={checkboxId} className="cursor-pointer text-sm font-medium">
              {isDone ? "Concluída" : "Marcar como concluída"}
            </Label>
          </div>
        </div>

        <DialogFooter className="flex-row flex-wrap gap-2 sm:justify-between">
          {item.createdByUserId === currentUserId ? (
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/perfis/${item.studentProfileId}/extras/${item.profileSubjectId}`}
                onClick={() => onOpenChange(false)}
              >
                <ExternalLink className="mr-1 size-4" aria-hidden />
                Abrir matéria
              </Link>
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
