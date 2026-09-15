import { Skeleton } from "@informach/ui/components/skeleton";
import { getRoutineSnapshot } from "@/features/unified-activities/service";
import { addDaysIso, todayLocalIso } from "../date";
import { listProfileSummaries } from "../repository";
import { getTodaySubjectsForProfiles } from "../today-subjects-service";
import { PerProfileProgress } from "./per-profile-progress";
import { RoutineView } from "./routine-view";

export async function RoutineSection({
  userId,
  profileFilter,
}: {
  userId: string;
  profileFilter: string | null;
}) {
  const tomorrowIso = addDaysIso(todayLocalIso(), 1);
  const [snapshot, perProfile, tomorrowSchedule] = await Promise.all([
    getRoutineSnapshot(userId, { profileFilter }),
    listProfileSummaries(userId),
    // Mochila de amanhã: as matérias do dia seguinte, para saber o que entra
    // na mochila junto com os materiais pedidos.
    getTodaySubjectsForProfiles(userId, { profileFilter, dateIso: tomorrowIso }),
  ]);

  return (
    <div className="space-y-8">
      <RoutineView
        todayIso={snapshot.todayIso}
        buckets={snapshot.buckets}
        initialCounters={snapshot.counters}
        tomorrowSchedule={tomorrowSchedule}
        currentUserId={userId}
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
