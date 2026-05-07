import { Card, CardContent, CardHeader } from "@informach/ui/components/card";
import { Skeleton } from "@informach/ui/components/skeleton";

/**
 * App-wide Suspense fallback. Routes that don't ship their own loading.tsx
 * fall back to this shell — keeps the visual silhouette of "page is loading"
 * instead of the blank "Carregando…" we used to render.
 */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-2">
        {["a", "b"].map((slot) => (
          <Card key={slot} className="border-border/60">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-3 w-48" />
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
