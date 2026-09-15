import { Skeleton } from "@informach/ui/components/skeleton";
import { getRoutineSnapshot } from "@/features/unified-activities/service";
import { listFamilyCompletionDays, listProfileSummaries } from "../repository";
import { countStreakDays } from "../streak";
import { getTomorrowSubjectsForProfiles } from "../today-subjects-service";
import { PerProfileProgress } from "./per-profile-progress";
import { RoutineView } from "./routine-view";

export async function RoutineSection({
  userId,
  profileFilter,
  showBackpack,
}: {
  userId: string;
  profileFilter: string | null;
  /**
   * Falso à noite, quando a mochila já é o primeiro bloco da página. A consulta
   * também não roda: repetir a busca para esconder o resultado seria pagar duas
   * vezes pelo mesmo horário.
   */
  showBackpack: boolean;
}) {
  const [snapshot, perProfile, tomorrowSchedule, completionDays] = await Promise.all([
    getRoutineSnapshot(userId, { profileFilter }),
    listProfileSummaries(userId),
    showBackpack ? getTomorrowSubjectsForProfiles(userId, { profileFilter }) : [],
    // Sem `profileFilter`: a sequência é da casa, não da criança em foco.
    listFamilyCompletionDays(userId),
  ]);

  return (
    <div className="space-y-8">
      <RoutineView
        todayIso={snapshot.todayIso}
        buckets={snapshot.buckets}
        initialCounters={snapshot.counters}
        tomorrowSchedule={tomorrowSchedule}
        doneToday={snapshot.doneToday}
        streakDays={countStreakDays(completionDays, snapshot.todayIso)}
        currentUserId={userId}
        profileFilter={profileFilter}
      />
      {perProfile.length >= 2 && profileFilter === null ? (
        <PerProfileProgress profiles={perProfile} />
      ) : null}
    </div>
  );
}

export function RoutineSkeleton() {
  return (
    <div role="status" aria-label="Carregando as atividades da rotina" className="space-y-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-hidden>
        {["overdue", "today", "week", "done"].map((key) => (
          <Skeleton key={key} className="h-24 rounded-xl" />
        ))}
      </div>
      {["attention", "tomorrow", "week"].map((key) => (
        <div key={key} className="space-y-4" aria-hidden>
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 shrink-0 rounded-2xl" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ))}
    </div>
  );
}
