import { cn } from "@informach/ui/lib/utils";
import { Sun } from "lucide-react";
import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { SharedActivitiesSection } from "@/features/activities/components/shared-activities-section";
import { getIsProForUser } from "@/features/billing/server-cache";
import { ExportPdfButton } from "@/features/dashboard/components/export-pdf-button";
import { RoutineSection, RoutineSkeleton } from "@/features/dashboard/components/routine-section";
import {
  TodayScheduleSection,
  TodayScheduleSkeleton,
} from "@/features/dashboard/components/today-schedule-section";
import { TomorrowBackpackSection } from "@/features/dashboard/components/tomorrow-backpack-section";
import { isEveningInApp } from "@/features/dashboard/date";
import { PendingDraftsSection } from "@/features/notices/components/pending-drafts-section";
import { WelcomeFlash } from "@/features/onboarding/components/welcome-flash";
import { NoStudentsWidget } from "@/features/students/components/no-students-widget";
import { ProfilesWithoutTurmaWidget } from "@/features/students/components/profiles-without-turma-widget";
import {
  countUserProfilesWithoutTurma,
  listStudentProfilesForUser,
} from "@/features/students/service";
import { NoSubjectsWidget } from "@/features/subjects/components/no-subjects-widget";
import { listTurmasNeedingSubjectsForUser } from "@/features/subjects/service";
import { getSubjectTintedClassByIndex } from "@/features/subjects/utils";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Rotina da família",
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
  // Depois das 18h em São Paulo a pergunta da casa muda, e a página se reordena
  // com ela: a mochila de amanhã vira o primeiro bloco e sai do bucket, para
  // não virar a segunda lista da mesma coisa.
  const evening = isEveningInApp();

  // Valida ?perfil= contra os perfis do user (defensivo: id inválido cai pra
  // "Todas"). O filtro é único na página e vale para o horário do dia, para os
  // buckets da rotina e para os destinos dos atalhos.
  const profileFilter =
    params.perfil && profiles.some((p) => p.id === params.perfil) ? params.perfil : null;

  // Streaming RSC: as queries acima decidem qual sub-árvore renderiza; o resto
  // entra por Suspense conforme resolve. Horário e rotina são boundaries
  // separadas para que o horário do dia — o primeiro olhar da manhã — apareça
  // sem esperar a lista de atividades.
  return (
    <Shell
      greeting={greeting}
      headerAction={<ExportPdfButton isPro={isPro} profileFilter={profileFilter} />}
    >
      {profiles.length > 1 ? (
        <nav aria-label="Filtrar rotina por criança" className="flex flex-wrap gap-2 text-sm">
          <Link
            className={cn(
              "min-h-11 rounded-full border px-4 py-2",
              !profileFilter ? "border-primary/30 bg-primary/10 font-semibold" : "hover:bg-muted",
            )}
            aria-current={!profileFilter ? "page" : undefined}
            href="/dashboard"
          >
            Todas
          </Link>
          {profiles.map((p, index) => (
            <Link
              key={p.id}
              href={`/dashboard?perfil=${p.id}`}
              aria-current={profileFilter === p.id ? "page" : undefined}
              className={cn(
                "min-h-11 rounded-full border px-4 py-2 transition-colors",
                profileFilter === p.id
                  ? `${getSubjectTintedClassByIndex((index % 5) + 1)} font-semibold`
                  : "hover:bg-muted",
              )}
            >
              {p.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <Suspense fallback={null}>
        <WelcomeFlash isPro={isPro} />
      </Suspense>
      <Suspense fallback={null}>
        <PendingDraftsSection userId={user.id} />
      </Suspense>
      {evening ? (
        // `fallback={null}` como as outras seções opcionais desta página: a
        // mochila não existe no sábado à noite nem sem horário cadastrado, e um
        // esqueleto de 112px piscando e sumindo empurraria a página inteira.
        <Suspense fallback={null}>
          <TomorrowBackpackSection userId={user.id} profileFilter={profileFilter} />
        </Suspense>
      ) : null}
      <Suspense fallback={<TodayScheduleSkeleton />}>
        <TodayScheduleSection userId={user.id} profileFilter={profileFilter} />
      </Suspense>
      <Suspense fallback={<RoutineSkeleton />}>
        <RoutineSection userId={user.id} profileFilter={profileFilter} showBackpack={!evening} />
      </Suspense>
      <Suspense fallback={null}>
        <SharedActivitiesSection userId={user.id} />
      </Suspense>
      {profiles.length === 0 ? <NoStudentsWidget /> : null}
      {/*
        Pendências de cadastro ficavam recolhidas atrás de um resumo, junto com
        um "Configuração escolar em dia." que não pede nada de ninguém. São
        itens acionáveis: aparecem abertos quando existem, e somem quando não.
        O resto da configuração tem casa própria, na aba Família.
      */}
      {profilesWithoutTurma > 0 || turmasNeedingSubjects.length > 0 ? (
        <div className="space-y-4">
          {profilesWithoutTurma > 0 ? (
            <ProfilesWithoutTurmaWidget count={profilesWithoutTurma} />
          ) : null}
          {turmasNeedingSubjects.length > 0 ? (
            <NoSubjectsWidget turmas={turmasNeedingSubjects} />
          ) : null}
        </div>
      ) : null}
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
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-4 py-8 pb-28 md:px-8">
      <header className="flex flex-wrap items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-chart-4/15 text-chart-4-ink">
          <Sun className="size-7" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Rotina da família</h1>
          <p className="break-words text-sm text-muted-foreground">
            Olá, {greeting}! Vamos organizar o dia e fazer juntos?
          </p>
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </header>
      {children}
    </main>
  );
}
