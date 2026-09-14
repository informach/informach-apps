import { notFound } from "next/navigation";
import { BackButton } from "@/components/app-shell/back-button";
import { SubjectsSection } from "@/features/subjects/components/subjects-section";
import { getSubjectsForUserAndTurma } from "@/features/subjects/service";
import { formatTurmaShort } from "@/features/turmas/utils";
import { requireUserServer } from "@/lib/auth";
import { billing } from "@/lib/billing";

export const metadata = {
  title: "Matérias",
};

export default async function SubjectsPage({ params }: { params: Promise<{ turmaId: string }> }) {
  const user = await requireUserServer();
  const { turmaId } = await params;

  const [result, isPro] = await Promise.all([
    getSubjectsForUserAndTurma(user.id, turmaId),
    billing.hasProSubscription({ type: "user", id: user.id }),
  ]);
  if (!result.ok) {
    // Tanto TURMA_NOT_FOUND quanto FORBIDDEN viram 404 — não vazamos existência da turma.
    notFound();
  }

  const { turma, subjects, canCreateSubject } = result.value;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="flex items-start gap-2">
        <BackButton href="/turmas" label="Voltar para turmas" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Matérias</h1>
          <p className="text-sm text-muted-foreground">
            {turma.schoolName} · {formatTurmaShort(turma)} · {turma.year}
          </p>
        </div>
      </header>
      <SubjectsSection
        subjects={subjects}
        turmaId={turma.id}
        currentUserId={user.id}
        canCreateSubject={canCreateSubject}
        isPro={isPro}
      />
    </main>
  );
}
