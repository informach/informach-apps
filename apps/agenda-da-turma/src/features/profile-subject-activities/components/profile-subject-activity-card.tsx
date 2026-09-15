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
import { toast } from "@informach/ui/components/sonner";
import { cn } from "@informach/ui/lib/utils";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  getActivityTypeIcon,
  getActivityTypeLabel,
  getDueBadgeLabel,
  getDueBadgeVariant,
  getDueUrgency,
} from "@/features/activities/utils";
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

  const TypeIcon = getActivityTypeIcon(activity.type);
  const isDone = activity.status === "done";
  // Prazo a confirmar é estado legítimo desde a convergência: a tarefa sem
  // data continua na rotina em vez de receber uma data fictícia.
  const urgency = getDueUrgency(activity.dueAt ?? "", isDone ? "done" : "pending");

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
            disabled={pending}
            aria-label={`Marcar "${activity.title}" como ${isDone ? "pendente" : "concluída"}`}
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className={cn("text-sm font-medium text-foreground", isDone && "line-through")}>
                {activity.title}
              </p>
              <Badge variant="outline" className="shrink-0 text-xs">
                <TypeIcon className="mr-1 size-3" aria-hidden />
                {getActivityTypeLabel(activity.type)}
              </Badge>
              <Badge variant={getDueBadgeVariant(urgency)} className="shrink-0 text-xs">
                {activity.dueAt ? getDueBadgeLabel(activity.dueAt, urgency) : "Prazo a confirmar"}
              </Badge>
            </div>
            {activity.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{activity.description}</p>
            ) : null}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Ações para ${activity.title}`}>
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
