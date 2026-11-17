import { Suspense } from "react";
import { MobileTopBar } from "@/components/app-shell/app-header";
import { SharedActivitiesSection } from "@/features/activities/components/shared-activities-section";
import { RoutineSection, RoutineSkeleton } from "@/features/dashboard/components/routine-section";
import { TodayHeader } from "@/features/dashboard/components/today-header";
import {
  loadTodaySchedule,
  TodayScheduleSection,
  TodayScheduleSkeleton,
} from "@/features/dashboard/components/today-schedule-section";
import { isEveningInApp, todayLocalIso } from "@/features/dashboard/date";
import { requireFamilyContext } from "@/features/family/context";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import { TodayViewedBeacon } from "@/features/metrics/components/today-viewed-beacon";
import { PendingDraftsSection } from "@/features/notices/components/pending-drafts-section";
import { CommitmentWidget } from "@/features/notifications/components/commitment-widget";
import { getNotificationPreferences } from "@/features/notifications/service";
import { FirstStepsSection } from "@/features/onboarding/components/first-steps-section";
import { ChildFilter, FilteredByChild } from "@/features/students/components/child-filter";
import { listStudentProfilesForUser } from "@/features/students/service";
import { shortChildNames } from "@/features/students/utils";
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
  const group = await requireFamilyContext(user.id);
  const actor = { userId: user.id, familyGroupId: group.id };
  const todayIso = todayLocalIso();

  const [profiles, notificationPrefs, familyEntitlements] = await Promise.all([
    listStudentProfilesForUser(actor),
    getNotificationPreferences(actor),
    getFamilyEntitlements(actor),
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
  // À noite a tela não mostra o horário de hoje (como na prancha da noite),
  // então nem consulta.
  const schoolData = evening ? null : loadTodaySchedule(actor, profileFilter);
  schoolData?.catch(() => {});

  const pillsHref = (profileId: string | null) =>
    profileId ? (`/dashboard?perfil=${profileId}` as const) : ("/dashboard" as const);
  // No celular as pílulas levam o avatar e ficam abaixo da frase; no
  // computador vão ao lado da data, só com o nome, como nas duas pranchas.
  const pills = <ChildFilter profiles={profiles} current={profileFilter} hrefFor={pillsHref} />;
  const header = (
    <TodayHeader
      todayIso={todayIso}
      userName={user.name}
      evening={evening}
      filter={
        evening ? (
          <FilteredByChild
            profiles={profiles}
            current={profileFilter}
            clearHref={pillsHref(null)}
          />
        ) : (
          <ChildFilter plain profiles={profiles} current={profileFilter} hrefFor={pillsHref} />
        )
      }
    />
  );
  // O que é do estado da conta, e não do dia: os primeiros passos, o recado
  // que ficou sem conferir, os avisos de configuração.
  const notices = (
    <>
      <Suspense fallback={null}>
        <FirstStepsSection
          actor={actor}
          profileCount={profiles.length}
          canManageProfiles={group.role === "administrator" || profiles.some((p) => p.canManage)}
        />
      </Suspense>
      <Suspense fallback={null}>
        <PendingDraftsSection actor={actor} />
      </Suspense>
    </>
  );
  const shared = (
    <Suspense fallback={null}>
      <SharedActivitiesSection actor={actor} />
    </Suspense>
  );

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 pb-28 lg:px-5 lg:pb-16 lg:pt-7">
      <MobileTopBar />
      <TodayViewedBeacon todayIso={todayIso} userId={user.id} />
      {/* Sem criança ainda, a rotina diria "nada para hoje" e mostraria uma
          semana vazia: a conta nova pareceria resolvida. Ficam só os primeiros
          passos, que é o que falta de verdade. */}
      {profiles.length === 0 ? (
        <div className="space-y-4 pt-2">
          {header}
          {notices}
        </div>
      ) : (
        <div className="pt-2 lg:pt-0">
          <Suspense
            fallback={
              <div className="space-y-4">
                {header}
                <RoutineSkeleton />
              </div>
            }
          >
            <RoutineSection
              actor={actor}
              profileFilter={profileFilter}
              childNames={shortChildNames(profiles)}
              evening={evening}
              header={header}
              pills={evening ? null : pills}
              notices={notices}
              school={
                schoolData ? (
                  <Suspense fallback={<TodayScheduleSkeleton />}>
                    <TodayScheduleSection data={schoolData} />
                  </Suspense>
                ) : null
              }
              shared={shared}
              commitment={
                shouldAskForCommitment ? (
                  <CommitmentWidget
                    key={actor.familyGroupId}
                    familyGroupId={actor.familyGroupId}
                    dismissedKey={`agenda:commitment-dismissed:${user.id}`}
                    current={notificationPrefs}
                  />
                ) : null
              }
            />
          </Suspense>
        </div>
      )}
    </main>
  );
}
