import { cn } from "@informach/ui/lib/utils";
import Link from "next/link";
import { Suspense } from "react";
import { SharedActivitiesSection } from "@/features/activities/components/shared-activities-section";
import { getIsProForUser } from "@/features/billing/server-cache";
import { RoutineSection, RoutineSkeleton } from "@/features/dashboard/components/routine-section";
import { TodayHeader } from "@/features/dashboard/components/today-header";
import {
  loadTodaySchedule,
  TodayScheduleSection,
  TodayScheduleSkeleton,
} from "@/features/dashboard/components/today-schedule-section";
import { TomorrowBackpackSection } from "@/features/dashboard/components/tomorrow-backpack-section";
import { isEveningInApp, todayLocalIso } from "@/features/dashboard/date";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import { TodayViewedBeacon } from "@/features/metrics/components/today-viewed-beacon";
import { PendingDraftsSection } from "@/features/notices/components/pending-drafts-section";
import { CommitmentWidget } from "@/features/notifications/components/commitment-widget";
import { getNotificationPreferences } from "@/features/notifications/service";
import { FirstStepsSection } from "@/features/onboarding/components/first-steps-section";
import { WelcomeFlash } from "@/features/onboarding/components/welcome-flash";
import { StudentAvatar } from "@/features/students/components/student-avatar";
import { listStudentProfilesForUser } from "@/features/students/service";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Hoje",
};

type Props = {
  searchParams: Promise<{ perfil?: string }>;
};

/**
 * Hoje, a página do dia.
 *
 * A ordem responde primeiro "o que é para hoje?": a data, a frase de resumo e
 * "Para hoje". Os primeiros passos sobem para o topo enquanto faltarem (antes
 * ficavam no fim, abaixo de quatro zeros e de "Tudo certo por aqui!"); à noite
 * a mochila de amanhã vira o primeiro bloco. O botão de PDF foi para a Semana,
 * como "Imprimir a semana", e o convite do horário do resumo virou uma linha no
 * fim, só para quem já tem rotina.
 */
export default async function DashboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const user = await requireUserServer();
  const todayIso = todayLocalIso();

  const [profiles, isPro, notificationPrefs, familyEntitlements] = await Promise.all([
    listStudentProfilesForUser(user.id),
    getIsProForUser(user.id),
    getNotificationPreferences(user.id),
    getFamilyEntitlements(user.id),
  ]);

  /*
   * O convite a combinar um horário aparece enquanto nenhum canal estiver
   * ligado, e só para a família que tem direito (o `enabled` do entitlement da
   * FAMÍLIA: o segundo adulto convidado tem direito porque o titular paga).
   * Sem esta condição o botão falhava com `PRO_REQUIRED` a cada sessão.
   */
  const shouldAskForCommitment =
    profiles.length > 0 &&
    familyEntitlements.enabled &&
    !notificationPrefs.emailEnabled &&
    !notificationPrefs.pushEnabled;

  // Depois das 18h em São Paulo a pergunta da casa muda, e a página se reordena
  // com ela: a mochila de amanhã vira o primeiro bloco e sai de "Amanhã".
  const evening = isEveningInApp();

  // Valida ?perfil= contra as crianças da conta: id inválido cai em "Todas". O
  // filtro é único na página e vale para as aulas, as listas e os destinos.
  const profileFilter =
    params.perfil && profiles.some((p) => p.id === params.perfil) ? params.perfil : null;
  // Começa agora, sem esperar: ver `loadTodaySchedule`. O `catch` vazio só
  // evita o aviso de rejeição não tratada; quem espera a promessa ainda recebe
  // o erro e o mostra no seu próprio limite.
  const schoolData = loadTodaySchedule(user.id, profileFilter);
  schoolData.catch(() => {});

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-28 pt-5 md:px-8 md:pt-8">
      <TodayViewedBeacon todayIso={todayIso} userId={user.id} />
      <TodayHeader todayIso={todayIso} userName={user.name} />
      {profiles.length > 1 ? (
        <nav aria-label="Filtrar por criança" className="flex flex-wrap gap-2">
          <Link
            className={cn(
              "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold",
              !profileFilter
                ? "bg-foreground text-background"
                : "border border-foreground/15 bg-background hover:bg-muted",
            )}
            aria-current={!profileFilter ? "page" : undefined}
            href="/dashboard"
          >
            Todas
          </Link>
          {profiles.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard?perfil=${p.id}`}
              aria-current={profileFilter === p.id ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-full pl-1.5 pr-4 text-sm font-bold",
                profileFilter === p.id
                  ? "bg-foreground text-background"
                  : "border border-foreground/15 bg-background hover:bg-muted",
              )}
            >
              <StudentAvatar name={p.name} size="pill" className="border" />
              {p.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <Suspense fallback={null}>
        <FirstStepsSection
          userId={user.id}
          profileCount={profiles.length}
          // A lista já traz a coluna de dono: saber se o adulto é titular ou
          // convidado não custa consulta nenhuma.
          ownsAnyProfile={profiles.some((p) => p.userId === user.id)}
        />
      </Suspense>
      <Suspense fallback={null}>
        <WelcomeFlash isPro={isPro} />
      </Suspense>
      <Suspense fallback={null}>
        <PendingDraftsSection userId={user.id} />
      </Suspense>
      {evening ? (
        // `fallback={null}`: a mochila não existe no sábado à noite nem sem
        // horário cadastrado, e um esqueleto piscando empurraria a página.
        <Suspense fallback={null}>
          <TomorrowBackpackSection userId={user.id} profileFilter={profileFilter} />
        </Suspense>
      ) : null}
      {/* Sem criança ainda, a rotina diria "nada para hoje" e mostraria uma
          semana vazia: a conta nova pareceria resolvida. Ficam só os primeiros
          passos, que é o que falta de verdade. */}
      {profiles.length === 0 ? null : (
        <Suspense fallback={<RoutineSkeleton />}>
          <RoutineSection
            userId={user.id}
            profileFilter={profileFilter}
            showBackpack={!evening}
            school={
              <Suspense fallback={<TodayScheduleSkeleton />}>
                <TodayScheduleSection data={schoolData} />
              </Suspense>
            }
            commitment={
              shouldAskForCommitment ? (
                <CommitmentWidget
                  dismissedKey={`agenda:commitment-dismissed:${user.id}`}
                  current={notificationPrefs}
                />
              ) : null
            }
          />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <SharedActivitiesSection userId={user.id} />
      </Suspense>
    </main>
  );
}
