import { Card, CardContent } from "@informach/ui/components/card";
import { Skeleton } from "@informach/ui/components/skeleton";

/**
 * Mirrors the layout in `dashboard/page.tsx` (header + search row + recipe
 * cards + pagination). Keeping the same container classes prevents the page
 * from "jumping" when content streams in.
 */
export default function DashboardLoading() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 md:px-8">
      <div className="mx-auto w-full max-w-3xl space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Skeleton className="h-12 w-full flex-1 rounded-md" />
          <Skeleton className="h-12 w-full rounded-md sm:w-32" />
        </div>

        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-32" />
        </div>

        <div className="space-y-3">
          {["r1", "r2", "r3", "r4", "r5"].map((slot) => (
            <Card key={slot} className="rounded-2xl border-border/60">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Skeleton className="size-11 rounded-full" />
                  <Skeleton className="size-11 rounded-full" />
                  <Skeleton className="size-11 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
