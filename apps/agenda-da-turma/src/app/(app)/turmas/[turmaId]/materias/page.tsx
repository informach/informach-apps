import { Button } from "@informach/ui/components/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SubjectsSection } from "@/features/subjects/components/subjects-section";
import { getSubjectsForUserAndTurma } from "@/features/subjects/service";
import { formatTurmaShort } from "@/features/turmas/utils";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Matérias — Agenda da Turma",
};

export default async function SubjectsPage({ params }: { params: Promise<{ turmaId: string }> }) {
  const user = await requireUserServer();
  const { turmaId } = await params;

  const result = await getSubjectsForUserAndTurma(user.id, turmaId);
  if (!result.ok) {
    // Tanto TURMA_NOT_FOUND quanto FORBIDDEN viram 404 — não vazamos existência da turma.
    notFound();
  }

  const { turma, subjects, canCreateSubject } = result.value;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 gap-1.5">
          <Link href="/turmas">
            <ArrowLeft className="size-4" aria-hidden />
            Turmas
          </Link>
        </Button>
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Matérias</h1>
          <p className="text-sm text-muted-foreground">
            {turma.schoolName} · {formatTurmaShort(turma)} · {turma.year}
          </p>
        </header>
      </div>
      <SubjectsSection
        subjects={subjects}
        turmaId={turma.id}
        currentUserId={user.id}
        canCreateSubject={canCreateSubject}
      />
    </main>
  );
}
