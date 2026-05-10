"use client";

import { Button } from "@informach/ui/components/button";
import { Card, CardContent } from "@informach/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@informach/ui/components/dropdown-menu";
import { BookOpen, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Subject } from "../types";
import { getSubjectIconClass, getSubjectTintedClass } from "../utils";
import { DeleteSubjectDialog } from "./delete-subject-dialog";
import { SubjectFormDialog } from "./subject-form-dialog";

type Props = {
  subject: Subject;
  turmaId: string;
  canManage: boolean;
};

export function SubjectCard({ subject, turmaId, canManage }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <Card className={getSubjectTintedClass(subject.name)}>
        <CardContent className="flex items-center gap-4 p-4">
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-full ${getSubjectIconClass(subject.name)}`}
          >
            <BookOpen className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-foreground">{subject.name}</p>
            {subject.teacherName ? (
              <p className="truncate text-sm text-muted-foreground">Prof. {subject.teacherName}</p>
            ) : null}
          </div>
          {canManage ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Ações para ${subject.name}`}>
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
          <SubjectFormDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            turmaId={turmaId}
            subject={subject}
          />
          <DeleteSubjectDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            subjectId={subject.id}
            subjectName={subject.name}
          />
        </>
      ) : null}
    </>
  );
}
