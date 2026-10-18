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
  evening,
  header,
  pills,
  notices,
  school,
  shared,
  commitment,
}: {
  userId: string;
  profileFilter: string | null;
  /** Depois das 18h a página vira a mochila de amanhã. */
  evening: boolean;
  header: ReactNode;
  pills: ReactNode;
  notices: ReactNode;
  /** "Hoje na escola", com o seu próprio Suspense. */
  school: ReactNode;
  shared: ReactNode;
  /** O convite do resumo, que só faz sentido para quem já tem rotina. */
  commitment?: ReactNode;
}) {
  const [snapshot, tomorrowSchedule, completionDays] = await Promise.all([
    getRoutineSnapshot(userId, { profileFilter }),
    getTomorrowSubjectsCached(userId, profileFilter),
    // Sem `profileFilter`: a sequência é da casa, não da criança em foco.
    listFamilyCompletionDays(userId),
  ]);
  // "Levar sempre" acompanha a mochila nos dois arranjos da página: de dia
  // dentro de "Amanhã", à noite como a própria página.
  const tomorrowKits = Object.fromEntries(
    await listSubjectKits(
      userId,
      tomorrowSchedule.map((view) => view.profileId),
    ),
  );
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
      evening={evening}
      doneToday={snapshot.doneToday}
      streakDays={countStreakDays(completionDays, snapshot.todayIso)}
      streakCountsToday={completionDays.includes(snapshot.todayIso)}
      currentUserId={userId}
      profileFilter={profileFilter}
      header={header}
      pills={pills}
      notices={notices}
      school={school}
      shared={shared}
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
