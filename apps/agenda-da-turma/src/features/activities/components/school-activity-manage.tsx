"use client";

import { Button } from "@informach/ui/components/button";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ActivityListItem, TurmaWithSubjectsForForm } from "../types";
import { ActivityFormDialog } from "./activity-form-dialog";
import { DeleteActivityDialog } from "./delete-activity-dialog";

/** Editar e excluir na página de detalhe, com as mesmas regras do card. */
export function SchoolActivityManage({
  item,
  isPro,
  turmas,
  canManage,
}: {
  item: ActivityListItem;
  isPro: boolean;
  turmas: TurmaWithSubjectsForForm[];
  canManage: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  if (!canManage) return null;

  return (
    <div className="flex flex-wrap gap-2 pt-2">
      <Button variant="outline" className="min-h-11" onClick={() => setEditOpen(true)}>
        <Pencil className="mr-2 size-4" aria-hidden />
        Editar
      </Button>
      <Button
        variant="outline"
        className="min-h-11 text-destructive hover:text-destructive"
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2 className="mr-2 size-4" aria-hidden />
        Excluir
      </Button>
      <ActivityFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        turmas={turmas}
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
        onOpenChange={setDeleteOpen}
        activityId={item.activityId}
        activityTitle={item.title}
      />
    </div>
  );
}
