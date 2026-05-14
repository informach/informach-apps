import { Skeleton } from "@informach/ui/components/skeleton";

const KPI_KEYS = ["overdue", "today", "week", "done"] as const;

/**
 * Skeleton consumido pelo `<Suspense fallback>` em torno de `<DashboardContent>`.
 * Reflete a estrutura real: ProfileFilterTabs + (opcional) TodaySubjectsCard +
 * KpiCards grid 2x4 + 3 ActivityBucketSection cards. Evita layout shift quando
 * o snapshot resolve.
 */
export function DashboardContentSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-full max-w-md rounded-lg" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {KPI_KEYS.map((key) => (
          <Skeleton key={key} className="h-[88px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  );
}
