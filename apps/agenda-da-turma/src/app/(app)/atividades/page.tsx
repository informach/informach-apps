import { ActivitiesSection } from "@/features/activities/components/activities-section";
import {
  getActivitiesCreatedCountForUser,
  getActivitiesPageForUser,
  getTurmasWithSubjectsForForm,
} from "@/features/activities/service";
import { getIsProForUser } from "@/features/billing/server-cache";
import { listStudentProfilesForUser } from "@/features/students/service";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Atividades — Agenda da Turma",
};

type SearchParams = { perfil?: string; cursor?: string };

export default async function AtividadesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUserServer();
  const params = await searchParams;
  const filterProfileId = params.perfil ?? null;
  const cursor = params.cursor ?? null;

  const [profiles, page, turmasForForm, isPro, activityCount] = await Promise.all([
    listStudentProfilesForUser(user.id),
    getActivitiesPageForUser(user.id, { profileFilter: filterProfileId, cursor }),
    getTurmasWithSubjectsForForm(user.id),
    getIsProForUser(user.id),
    getActivitiesCreatedCountForUser(user.id),
  ]);

  const activeFilter = filterProfileId
    ? (profiles.find((p) => p.id === filterProfileId) ?? null)
    : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Atividades</h1>
        <p className="text-sm text-muted-foreground">
          Tarefas, provas, trabalhos e lembretes dos seus estudantes. Marque o status conforme você
          avança.
        </p>
      </header>
      <ActivitiesSection
        items={page.items}
        nextCursor={page.nextCursor}
        isPaginated={cursor !== null}
        profiles={profiles}
        activeFilter={activeFilter}
        turmasForForm={turmasForForm}
        currentUserId={user.id}
        isPro={isPro}
        activityCount={activityCount}
      />
    </main>
  );
}
