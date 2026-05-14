"use client";

import { Button } from "@informach/ui/components/button";
import { Card, CardContent } from "@informach/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@informach/ui/components/dropdown-menu";
import { MoreVertical, Pencil, Repeat, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { CLASS_DAY_LABEL_SHORT, formatClassDaysShort } from "../class-days";
import type { Subject } from "../types";
import { getSubjectIcon, getSubjectIconClassByIndex, getSubjectTintedClassByIndex } from "../utils";
import { DeleteSubjectDialog } from "./delete-subject-dialog";
import { SubjectFormDialog } from "./subject-form-dialog";

type Props = {
  subject: Subject;
  turmaId: string;
  currentUserId: string;
  // Outras matérias da turma — passadas pro SubjectFormDialog quando o user
  // edita (combobox de revezamento). Opcional pra retrocompat com call-sites
  // legacy que ainda não migraram.
  turmaSubjects?: readonly Subject[];
};

export function SubjectCard({ subject, turmaId, currentUserId, turmaSubjects }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const Icon = getSubjectIcon(subject.name);
  // Só o criador da matéria edita/exclui. O service também aplica o guard
  // (defesa em camadas) — esse check aqui só esconde os botões.
  const canManage = subject.createdByUserId === currentUserId;

  // Resume os slots de revezamento em string curta tipo "qua reveza com ACC".
  // Quando há múltiplos slots (matéria com revezamento em vários dias),
  // separa por vírgula. Tolera caller que não passou `turmaSubjects` —
  // nesse caso mostra só o dia sem o nome da matéria pareada.
  const slotsSummary = useMemo(() => {
    if (subject.alternatingSlots.length === 0) return null;
    const subjectsById = new Map(turmaSubjects?.map((s) => [s.id, s.name]) ?? []);
    const parts = subject.alternatingSlots
      .map((slot) => {
        const dayLabel = CLASS_DAY_LABEL_SHORT[slot.dayOfWeek];
        const pairedName = subjectsById.get(slot.pairedSubjectId);
        return pairedName ? `${dayLabel} reveza com ${pairedName}` : `${dayLabel} quinzenal`;
      })
      .join(" · ");
    return parts;
  }, [subject.alternatingSlots, turmaSubjects]);

  return (
    <>
      <Card className={getSubjectTintedClassByIndex(subject.colorIndex)}>
        <CardContent className="flex items-center gap-4 p-4">
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-full ${getSubjectIconClassByIndex(subject.colorIndex)}`}
          >
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-foreground">{subject.name}</p>
            {subject.teacherName ? (
              <p className="truncate text-sm text-muted-foreground">Prof. {subject.teacherName}</p>
            ) : null}
            {subject.classDays.length > 0 ? (
              <p className="truncate text-xs text-muted-foreground">
                {formatClassDaysShort(subject.classDays)}
              </p>
            ) : null}
            {slotsSummary ? (
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                <Repeat className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{slotsSummary}</span>
              </p>
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
            turmaSubjects={turmaSubjects}
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
