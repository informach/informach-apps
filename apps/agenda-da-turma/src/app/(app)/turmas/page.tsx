import { listStudentProfilesForUser } from "@/features/students/service";
import { TurmasSection } from "@/features/turmas/components/turmas-section";
import { listTurmasForCurrentUser } from "@/features/turmas/service";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Turmas — Agenda da Turma",
};

type SearchParams = { perfil?: string };

export default async function TurmasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUserServer();
  const params = await searchParams;
  const filterProfileId = params.perfil ?? null;

  const [profiles, allTurmas] = await Promise.all([
    listStudentProfilesForUser(user.id),
    listTurmasForCurrentUser(user.id),
  ]);

  const activeFilter = filterProfileId
    ? (profiles.find((p) => p.id === filterProfileId) ?? null)
    : null;

  const turmas = activeFilter
    ? allTurmas.filter((t) => t.members.some((m) => m.profileId === activeFilter.id))
    : allTurmas;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Turmas</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie as turmas dos seus estudantes. Cadastre uma nova ou entre em uma existente com
          código compartilhado.
        </p>
      </header>
      <TurmasSection turmas={turmas} profiles={profiles} activeFilter={activeFilter} />
    </main>
  );
}
