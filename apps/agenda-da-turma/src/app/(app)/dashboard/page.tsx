import type { ReactNode } from "react";
import { SharedActivitiesWidget } from "@/features/activities/components/shared-activities-widget";
import {
  getPendingSharedActivitiesForUser,
  getTurmasWithSubjectsForForm,
} from "@/features/activities/service";
import { getIsProForUser } from "@/features/billing/server-cache";
import { DashboardContent } from "@/features/dashboard/components/dashboard-content";
import { DashboardNavButtons } from "@/features/dashboard/components/dashboard-nav-buttons";
import { ExportPdfButton } from "@/features/dashboard/components/export-pdf-button";
import { getTodaySubjectsForProfile } from "@/features/dashboard/today-subjects-service";
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

  // Decide se mostra "Matérias de hoje": só quando há UM perfil ativo na visão.
  // Com múltiplos perfis sem filtro, misturar matérias de turmas diferentes
  // confundiria mais que ajudaria — o user precisa filtrar primeiro.
  const effectiveProfileId = profiles.length === 1 ? (profiles[0]?.id ?? null) : profileFilter;

  const [pendingShared, turmasForForm, todaySubjects] = await Promise.all([
    isPro ? getPendingSharedActivitiesForUser(user.id) : Promise.resolve([]),
    getTurmasWithSubjectsForForm(user.id),
    effectiveProfileId
      ? getTodaySubjectsForProfile(user.id, effectiveProfileId)
      : Promise.resolve(null),
  ]);

  return (
    <Shell
      greeting={greeting}
      headerAction={<ExportPdfButton isPro={isPro} profileFilter={profileFilter} />}
    >
      <DashboardNavButtons />
      {pendingShared.length > 0 ? <SharedActivitiesWidget items={pendingShared} /> : null}
      <DashboardContent
        userId={user.id}
        isPro={isPro}
        profileFilter={profileFilter}
        profiles={profiles.map((p) => ({ id: p.id, name: p.name }))}
        turmasForForm={turmasForForm}
        todaySubjects={todaySubjects}
      />
    </Shell>
  );
}

function Shell({
  greeting,
  headerAction,
  children,
}: {
  greeting: string;
  headerAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Bem-vindo de volta, {greeting}.</p>
        </div>
        {headerAction}
      </header>
      {children}
    </main>
  );
}
