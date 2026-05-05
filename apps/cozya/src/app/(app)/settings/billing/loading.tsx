import { Card, CardContent, CardHeader } from "@informach/ui/components/card";
import { Skeleton } from "@informach/ui/components/skeleton";

/**
 * Local Suspense fallback for `/settings/billing`. Renders a skeleton that
 * matches the real page layout so the user sees the page loading rather than
 * a blank "Carregando…" — which is what they were seeing before this file
 * existed (the global app/loading.tsx fires for any RSC that hasn't streamed).
 */
export default function BillingLoading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {["plan", "balance", "expiring"].map((slot) => (
          <Card key={slot} className="border-border/60">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-3 w-48" />
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <Skeleton className="h-5 w-44" />
        <Card className="border-border/60">
          <CardContent className="space-y-3 p-4">
            {["row1", "row2", "row3", "row4"].map((slot) => (
              <div key={slot} className="flex items-center justify-between gap-3">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
