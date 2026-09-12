import { cn } from "@informach/ui/lib/utils";
import { BackButton } from "@/components/app-shell/back-button";
import { ActivitiesSection } from "@/features/activities/components/activities-section";
import { FREE_ACTIVITY_LIMIT } from "@/features/activities/limits";
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

  const limitReached = !isPro && activityCount >= FREE_ACTIVITY_LIMIT;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2">
          <BackButton href="/dashboard" label="Voltar para o dashboard" />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Atividades</h1>
            <p className="text-sm text-muted-foreground">
              Para casa, trabalhos, provas e lembretes. Cadastre por matéria e acompanhe o que já
              foi concluído.
            </p>
          </div>
        </div>
        {!isPro ? (
          <span
            className={cn(
              "shrink-0 text-xs sm:pt-2",
              limitReached ? "font-medium text-destructive" : "text-muted-foreground",
            )}
          >
            {activityCount}/{FREE_ACTIVITY_LIMIT} atividades · plano Free
          </span>
        ) : null}
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
