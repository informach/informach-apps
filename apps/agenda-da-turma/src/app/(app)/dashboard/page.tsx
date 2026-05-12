import type { ReactNode } from "react";
import { SharedActivitiesWidget } from "@/features/activities/components/shared-activities-widget";
import {
  getPendingSharedActivitiesForUser,
  getTurmasWithSubjectsForForm,
} from "@/features/activities/service";
import { getIsProForUser } from "@/features/billing/server-cache";
import { DashboardContent } from "@/features/dashboard/components/dashboard-content";
import { NoStudentsWidget } from "@/features/students/components/no-students-widget";
import { ProfilesWithoutTurmaWidget } from "@/features/students/components/profiles-without-turma-widget";
import {
  countUserProfilesWithoutTurma,
  listStudentProfilesForUser,
} from "@/features/students/service";
import { NoSubjectsWidget } from "@/features/subjects/components/no-subjects-widget";
import { listTurmasNeedingSubjectsForUser } from "@/features/subjects/service";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Dashboard — Agenda da Turma",
};

type Props = {
  searchParams: Promise<{ perfil?: string }>;
};

export default async function DashboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const user = await requireUserServer();

  const [profiles, profilesWithoutTurma, turmasNeedingSubjects, isPro] = await Promise.all([
    listStudentProfilesForUser(user.id),
    countUserProfilesWithoutTurma(user.id),
    listTurmasNeedingSubjectsForUser(user.id),
    getIsProForUser(user.id),
  ]);

  const greeting = user.name ?? "responsável";

  // Onboarding gates: cada estágio exclui mutuamente o seguinte. Mantém o
  // comportamento prévio de "guie o user antes de mostrar o dashboard real".
  if (profiles.length === 0) {
    return (
      <Shell greeting={greeting}>
        <NoStudentsWidget />
      </Shell>
    );
  }
  if (profilesWithoutTurma > 0) {
    return (
      <Shell greeting={greeting}>
        <ProfilesWithoutTurmaWidget count={profilesWithoutTurma} />
      </Shell>
    );
  }
  if (turmasNeedingSubjects.length > 0) {
    return (
      <Shell greeting={greeting}>
        <NoSubjectsWidget turmas={turmasNeedingSubjects} />
      </Shell>
    );
  }

  // Onboarding completo — dashboard real.
  // Valida ?perfil= contra os perfis do user (defensivo: id inválido cai pra "Todos").
  const profileFilter =
    params.perfil && profiles.some((p) => p.id === params.perfil) ? params.perfil : null;

  const [pendingShared, turmasForForm] = await Promise.all([
    isPro ? getPendingSharedActivitiesForUser(user.id) : Promise.resolve([]),
    getTurmasWithSubjectsForForm(user.id),
  ]);

  return (
    <Shell greeting={greeting}>
      {pendingShared.length > 0 ? <SharedActivitiesWidget items={pendingShared} /> : null}
      <DashboardContent
        userId={user.id}
        isPro={isPro}
        profileFilter={profileFilter}
        profiles={profiles.map((p) => ({ id: p.id, name: p.name }))}
        turmasForForm={turmasForForm}
      />
    </Shell>
  );
}

function Shell({ greeting, children }: { greeting: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Bem-vindo de volta, {greeting}.</p>
      </header>
      {children}
    </main>
  );
}
