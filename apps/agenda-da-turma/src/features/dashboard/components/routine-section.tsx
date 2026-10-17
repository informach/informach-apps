import { Skeleton } from "@informach/ui/components/skeleton";
import type { ReactNode } from "react";
import { listSubjectKits } from "@/features/subject-kits/service";
import { getRoutineSnapshot } from "@/features/unified-activities/service";
import { listFamilyCompletionDays } from "../repository";
import { getTomorrowSubjectsCached } from "../schedule-cache";
import { countStreakDays } from "../streak";
import { RoutineView } from "./routine-view";

export async function RoutineSection({
  userId,
  profileFilter,
  showBackpack,
  school,
  commitment,
}: {
  userId: string;
  profileFilter: string | null;
  /**
   * Falso à noite, quando a mochila já é o primeiro bloco da página. O horário
   * de amanhã continua sendo lido (a consulta é memorizada por requisição e a
   * mochila do topo já pagou por ela): sem ele, "Amanhã" dizia "livre por
   * enquanto" logo abaixo de uma mochila cheia.
   */
  showBackpack: boolean;
  /** "Hoje na escola", com o seu próprio Suspense, entre "Para hoje" e "Amanhã". */
  school?: ReactNode;
  /** O convite do resumo, que só faz sentido para quem já tem rotina. */
  commitment?: ReactNode;
}) {
  const [snapshot, tomorrowSchedule, completionDays] = await Promise.all([
    getRoutineSnapshot(userId, { profileFilter }),
    getTomorrowSubjectsCached(userId, profileFilter),
    // Sem `profileFilter`: a sequência é da casa, não da criança em foco.
    listFamilyCompletionDays(userId),
  ]);
  // "Levar sempre" acompanha a mochila nos DOIS lugares em que ela aparece: de
  // dia dentro de "Amanhã", à noite no topo. A mesma tela não pode mostrar
  // conteúdo diferente conforme a hora. À noite a lista de dentro não aparece,
  // e os itens não precisam ser lidos.
  const tomorrowKits = showBackpack
    ? Object.fromEntries(
        await listSubjectKits(
          userId,
          tomorrowSchedule.map((view) => view.profileId),
        ),
      )
    : {};
  const hasRoutine =
    snapshot.doneToday > 0 ||
    snapshot.buckets.attention.length +
      snapshot.buckets.tomorrow.length +
      snapshot.buckets.week.length >
      0;

  return (
    <RoutineView
      todayIso={snapshot.todayIso}
      buckets={snapshot.buckets}
      tomorrowSchedule={tomorrowSchedule}
      tomorrowKits={tomorrowKits}
      showBackpackRow={showBackpack}
      doneToday={snapshot.doneToday}
      streakDays={countStreakDays(completionDays, snapshot.todayIso)}
      streakCountsToday={completionDays.includes(snapshot.todayIso)}
      currentUserId={userId}
      profileFilter={profileFilter}
      school={school}
      commitment={hasRoutine ? commitment : null}
    />
  );
}

export function RoutineSkeleton() {
  return (
    <div role="status" aria-label="Carregando as atividades de hoje" className="space-y-4">
      <Skeleton className="h-5 w-3/4" aria-hidden />
      {["today", "tomorrow", "week"].map((key) => (
        <Skeleton key={key} className="h-40 rounded-[20px]" aria-hidden />
      ))}
    </div>
  );
}
