import { Button } from "@informach/ui/components/button";
import { Card, CardContent } from "@informach/ui/components/card";
import { BookOpen } from "lucide-react";
import Link from "next/link";
import type { TurmaNeedingSubjects } from "../types";

type Props = {
  turmas: TurmaNeedingSubjects[];
};

function formatGradeShort(grade: string, classLetter: string): string {
  return `${grade.charAt(0)}º ano ${classLetter}`;
}

export function NoSubjectsWidget({ turmas }: Props) {
  if (turmas.length === 0) return null;

  if (turmas.length === 1) {
    const turma = turmas[0];
    if (!turma) return null;
    return (
      <Card className="border-chart-3/40 bg-gradient-to-br from-secondary/10 via-secondary/5 to-chart-3/10">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary/15 text-secondary">
              <BookOpen className="size-5" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">
                Cadastre as matérias da turma
              </p>
              <p className="text-sm text-muted-foreground">
                {turma.schoolName} · {formatGradeShort(turma.grade, turma.classLetter)} ainda não
                tem matérias. Cadastre para começar a organizar tarefas e provas.
              </p>
            </div>
          </div>
          <Button asChild variant="secondary" className="shrink-0">
            <Link href={`/turmas/${turma.turmaId}/materias`}>Cadastrar matérias</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-chart-3/40 bg-gradient-to-br from-secondary/10 via-secondary/5 to-chart-3/10">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary/15 text-secondary">
            <BookOpen className="size-5" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">
              {turmas.length} turmas precisam de matérias
            </p>
            <p className="text-sm text-muted-foreground">
              Cadastre as matérias para começar a organizar tarefas e provas.
            </p>
          </div>
        </div>
        <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {turmas.map((turma) => (
            <li key={turma.turmaId}>
              <Button asChild variant="secondary" size="sm">
                <Link href={`/turmas/${turma.turmaId}/materias`}>
                  {turma.schoolName} · {formatGradeShort(turma.grade, turma.classLetter)}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
