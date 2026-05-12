import { Skeleton } from "@informach/ui/components/skeleton";

const KPI_KEYS = ["overdue", "today", "week", "done"] as const;

export default function DashboardLoading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </header>

      {/* KPI cards: grid 2x2 mobile, 1x4 desktop */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {KPI_KEYS.map((key) => (
          <Skeleton key={key} className="h-[88px] rounded-xl" />
        ))}
      </div>

      {/* Sections placeholders */}
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    </main>
  );
}
