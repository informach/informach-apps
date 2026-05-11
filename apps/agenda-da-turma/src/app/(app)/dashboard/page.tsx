import { SharedActivitiesWidget } from "@/features/activities/components/shared-activities-widget";
import { getPendingSharedActivitiesForUser } from "@/features/activities/service";
import { getIsProForUser } from "@/features/billing/server-cache";
import { NoStudentsWidget } from "@/features/students/components/no-students-widget";
import { ProfilesWithoutTurmaWidget } from "@/features/students/components/profiles-without-turma-widget";
import {
  countUserProfilesWithoutTurma,
  countUserStudentProfiles,
} from "@/features/students/service";
import { NoSubjectsWidget } from "@/features/subjects/components/no-subjects-widget";
import { listTurmasNeedingSubjectsForUser } from "@/features/subjects/service";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Dashboard — Agenda da Turma",
};

export default async function DashboardPage() {
  const user = await requireUserServer();
  const [profilesCount, profilesWithoutTurma, turmasNeedingSubjects, isPro] = await Promise.all([
    countUserStudentProfiles(user.id),
    countUserProfilesWithoutTurma(user.id),
    listTurmasNeedingSubjectsForUser(user.id),
    getIsProForUser(user.id),
  ]);

  // Widget de aceite só faz sentido quando o onboarding tá completo
  // (profiles + turmas + matérias) E o user é Pro. Fora isso, atividades
  // compartilhadas nem são visíveis pra esse user.
  const onboardingDone =
    profilesCount > 0 && profilesWithoutTurma === 0 && turmasNeedingSubjects.length === 0;
  const pendingShared =
    isPro && onboardingDone ? await getPendingSharedActivitiesForUser(user.id) : [];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Bem-vindo de volta, {user.name ?? "responsável"}.
        </p>
      </header>

      {profilesCount === 0 ? (
        <NoStudentsWidget />
      ) : profilesWithoutTurma > 0 ? (
        <ProfilesWithoutTurmaWidget count={profilesWithoutTurma} />
      ) : turmasNeedingSubjects.length > 0 ? (
        <NoSubjectsWidget turmas={turmasNeedingSubjects} />
      ) : null}

      {pendingShared.length > 0 ? <SharedActivitiesWidget items={pendingShared} /> : null}
    </main>
  );
}
