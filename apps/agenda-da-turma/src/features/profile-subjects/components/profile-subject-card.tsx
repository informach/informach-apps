"use client";

import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import { Card, CardContent } from "@informach/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@informach/ui/components/dropdown-menu";
import { toast } from "@informach/ui/components/sonner";
import { cn } from "@informach/ui/lib/utils";
import { ChevronRight, MoreVertical, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ProfileSubjectActivityFormDialog } from "@/features/profile-subject-activities/components/profile-subject-activity-form-dialog";
import {
  getSubjectIcon,
  getSubjectIconClassByIndex,
  getSubjectTintedClassByIndex,
} from "@/features/subjects/utils";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { setProfileSubjectStatusAction } from "../actions";
import { formatExtraClassDaysShort } from "../class-days";
import type { ProfileSubjectWithCounts } from "../types";
import { DeleteProfileSubjectDialog } from "./delete-profile-subject-dialog";
import { ProfileSubjectFormDialog } from "./profile-subject-form-dialog";

type Props = {
  subject: ProfileSubjectWithCounts;
  profileId: string;
};

function formatPausedSinceLabel(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

export function ProfileSubjectCard({ subject, profileId }: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newActivityOpen, setNewActivityOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const Icon = getSubjectIcon(subject.name);
  const isPaused = subject.status === "paused";
  const classDaysLabel = formatExtraClassDaysShort(subject.classDays);

  const toggleStatus = () => {
    startTransition(async () => {
      const next = isPaused ? "active" : "paused";
      const result = await catchActionResult(() =>
        setProfileSubjectStatusAction({ id: subject.id, status: next }),
      );
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível atualizar.", {
            description: "Atualize a página e tente novamente.",
          });
          router.refresh();
          return;
        }
        if (result.error.code === "NOT_FOUND") {
          toast.error("Matéria não encontrada");
        } else {
          toast.error("Não foi possível atualizar.");
        }
        return;
      }
      toast.success(next === "paused" ? "Matéria pausada" : "Matéria retomada");
      router.refresh();
    });
  };

  return (
    <>
      <Card className={cn(isPaused && "opacity-75")}>
        <CardContent className="flex items-center gap-4 p-4">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full",
              getSubjectIconClassByIndex(subject.colorIndex),
            )}
          >
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-base font-semibold text-foreground">{subject.name}</p>
              {isPaused ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 text-xs",
                    getSubjectTintedClassByIndex(subject.colorIndex),
                  )}
                >
                  Pausada
                </Badge>
              ) : null}
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {classDaysLabel || "Sem dias cadastrados"}
              {subject.pendingActivitiesCount > 0
                ? ` · ${subject.pendingActivitiesCount} pendente${
                    subject.pendingActivitiesCount === 1 ? "" : "s"
                  }`
                : null}
            </p>
            {isPaused && subject.pausedAt ? (
              <p className="text-xs text-muted-foreground">
                Pausada desde {formatPausedSinceLabel(subject.pausedAt)}
              </p>
            ) : null}
          </div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            aria-label={`Ver atividades de ${subject.name}`}
          >
            <Link href={`/perfis/${profileId}/extras/${subject.id}`}>
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Ações para ${subject.name}`}>
                <MoreVertical className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isPaused ? (
                <DropdownMenuItem onSelect={() => setNewActivityOpen(true)}>
                  <Plus className="mr-2 size-4" aria-hidden />
                  Nova atividade
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={toggleStatus} disabled={pending}>
                {isPaused ? (
                  <>
                    <Play className="mr-2 size-4" aria-hidden />
                    Retomar
                  </>
                ) : (
                  <>
                    <Pause className="mr-2 size-4" aria-hidden />
                    Pausar
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                <Pencil className="mr-2 size-4" aria-hidden />
                Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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
        open={newActivityOpen}
        onOpenChange={setNewActivityOpen}
        profileSubjectId={subject.id}
        profileSubjectName={subject.name}
      />

      <ProfileSubjectFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        profileId={profileId}
        subject={subject}
      />
      <DeleteProfileSubjectDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        subjectId={subject.id}
        subjectName={subject.name}
        pendingActivitiesCount={subject.pendingActivitiesCount}
      />
    </>
  );
}
