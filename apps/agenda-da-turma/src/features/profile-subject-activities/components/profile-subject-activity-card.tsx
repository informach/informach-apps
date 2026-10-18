"use client";

import { Button } from "@informach/ui/components/button";
import { Card, CardContent } from "@informach/ui/components/card";
import { Checkbox } from "@informach/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@informach/ui/components/dropdown-menu";
import { toast } from "@informach/ui/components/sonner";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { cn } from "@informach/ui/lib/utils";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { getActivityTypeIcon, getActivityTypeLabel } from "@/features/activities/utils";
import { DueChip } from "@/features/unified-activities/components/due-chip";
import { describeDue } from "@/features/unified-activities/due";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { setProfileSubjectActivityStatusAction } from "../actions";
import type { ProfileSubjectActivity } from "../types";
import { DeleteProfileSubjectActivityDialog } from "./delete-profile-subject-activity-dialog";
import { ProfileSubjectActivityFormDialog } from "./profile-subject-activity-form-dialog";

type Props = {
  activity: ProfileSubjectActivity;
  profileSubjectName: string;
};

export function ProfileSubjectActivityCard({ activity, profileSubjectName }: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Mesmo motivo do `ready` de `useCardToggle`: antes de hidratar, o toque some.
  const hydrated = useHydrated();

  const TypeIcon = getActivityTypeIcon(activity.type);
  const isDone = activity.status === "done";
  // Sem data é estado legítimo desde a convergência: a tarefa sem data
  // continua na rotina em vez de receber uma data fictícia.
  const due = describeDue({
    dueAt: activity.dueAt,
    time: null,
    status: isDone ? "done" : "pending",
  });

  const handleToggle = (next: boolean) => {
    startTransition(async () => {
      const result = await catchActionResult(() =>
        setProfileSubjectActivityStatusAction({
          id: activity.id,
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
    <>
      <Card className={cn(isDone && "opacity-60")}>
        <CardContent className="flex items-start gap-3 p-4">
          <Checkbox
            checked={isDone}
            onCheckedChange={(v) => handleToggle(v === true)}
            disabled={!hydrated || pending}
            aria-label={`${isDone ? "Reabrir" : "Marcar como feito"}: ${activity.title}`}
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "break-words text-[15px] font-bold text-foreground",
                isDone && "line-through",
              )}
            >
              {activity.title}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <TypeIcon className="size-3.5" aria-hidden />
              {getActivityTypeLabel(activity.type)}
            </p>
            {activity.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{activity.description}</p>
            ) : null}
          </div>
          <DueChip due={due} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 rounded-full"
                aria-label={`Ações para ${activity.title}`}
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
        </CardContent>
      </Card>

      <ProfileSubjectActivityFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        profileSubjectId={activity.profileSubjectId}
        profileSubjectName={profileSubjectName}
        activity={activity}
      />
      <DeleteProfileSubjectActivityDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        activityId={activity.id}
        title={activity.title}
      />
    </>
  );
}
