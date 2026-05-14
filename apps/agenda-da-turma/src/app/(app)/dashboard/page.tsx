import { type ReactNode, Suspense } from "react";
import { SharedActivitiesSection } from "@/features/activities/components/shared-activities-section";
import { getIsProForUser } from "@/features/billing/server-cache";
import { DashboardContentSkeleton } from "@/features/dashboard/components/dashboard-content-skeleton";
import { DashboardNavButtons } from "@/features/dashboard/components/dashboard-nav-buttons";
import { DashboardSection } from "@/features/dashboard/components/dashboard-section";
import { ExportPdfButton } from "@/features/dashboard/components/export-pdf-button";
import { pickDashboardGate } from "@/features/dashboard/gate";
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

  // Onboarding gates: cada estágio exclui mutuamente o seguinte. Decisão
  // delegada à `pickDashboardGate` (pura, testada em gate.test.ts) pra
  // garantir que a ordem de precedência fica documentada e não regride.
  const gate = pickDashboardGate({
    profilesCount: profiles.length,
    profilesWithoutTurmaCount: profilesWithoutTurma,
    turmasNeedingSubjectsCount: turmasNeedingSubjects.length,
  });

  if (gate.kind === "no-students") {
    return (
      <Shell greeting={greeting}>
        <NoStudentsWidget />
      </Shell>
    );
  }
  if (gate.kind === "profiles-without-turma") {
    return (
      <Shell greeting={greeting}>
        <ProfilesWithoutTurmaWidget count={gate.count} />
      </Shell>
    );
  }
  if (gate.kind === "no-subjects") {
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
  const trimmedProfiles = profiles.map((p) => ({ id: p.id, name: p.name }));

  // Streaming RSC: as queries dos gates acima já são essenciais (decidem qual
  // sub-tree renderiza). A partir daqui, o shell + nav buttons vão pro browser
  // imediatamente; o resto entra via Suspense conforme as queries resolvem.
  // Splittar `SharedActivitiesSection` em sua própria boundary evita que ela
  // segure `DashboardSection` (e vice-versa) — duas queries paralelas que
  // streamam independente.
  return (
    <Shell
      greeting={greeting}
      headerAction={<ExportPdfButton isPro={isPro} profileFilter={profileFilter} />}
    >
      <DashboardNavButtons />
      {isPro ? (
        <Suspense fallback={null}>
          <SharedActivitiesSection userId={user.id} />
        </Suspense>
      ) : null}
      <Suspense fallback={<DashboardContentSkeleton />}>
        <DashboardSection
          userId={user.id}
          isPro={isPro}
          profileFilter={profileFilter}
          profiles={trimmedProfiles}
          effectiveProfileId={effectiveProfileId}
        />
      </Suspense>
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
