"use client";

import { Button } from "@informach/ui/components/button";
import { Card, CardContent } from "@informach/ui/components/card";
import { BookOpen, Plus } from "lucide-react";
import { useState } from "react";
import type { Subject } from "../types";
import { SubjectCard } from "./subject-card";
import { SubjectFormDialog } from "./subject-form-dialog";

type Props = {
  subjects: Subject[];
  turmaId: string;
  canManage: boolean;
};

export function SubjectsSection({ subjects, turmaId, canManage }: Props) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {subjects.length === 0
            ? "Nenhuma matéria cadastrada nesta turma."
            : `${subjects.length} ${subjects.length === 1 ? "matéria" : "matérias"} cadastrada${subjects.length === 1 ? "" : "s"}.`}
        </p>
        {canManage ? (
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 size-4" aria-hidden />
            Nova matéria
          </Button>
        ) : null}
      </div>

      {subjects.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <BookOpen className="size-6" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">
                {canManage ? "Cadastre as matérias da turma" : "Esta turma ainda não tem matérias"}
              </p>
              <p className="text-sm text-muted-foreground">
                {canManage
                  ? "As matérias ficam disponíveis para todas as famílias vinculadas a esta turma."
                  : "Aguarde quem criou a turma cadastrar as matérias."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {subjects.map((subject) => (
            <SubjectCard
              key={subject.id}
              subject={subject}
              turmaId={turmaId}
              canManage={canManage}
            />
          ))}
        </div>
      )}

      {canManage ? (
        <SubjectFormDialog open={createOpen} onOpenChange={setCreateOpen} turmaId={turmaId} />
      ) : null}
    </div>
  );
}
