import { Card, CardContent } from "@informach/ui/components/card";
import { Skeleton } from "@informach/ui/components/skeleton";

/**
 * Mirrors `atividades/page.tsx`: header + filter/actions row + N activity cards.
 * Mantém a silhueta enquanto a página streamea — sem flash branco.
 */
export default function AtividadesLoading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-80" />
      </header>

      <div className="space-y-4">
        {/* Filter + actions row */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-44 rounded-md" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-9 w-36 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        </div>

        {/* Activity card list */}
        <div className="flex flex-col gap-3">
          {["a1", "a2", "a3", "a4", "a5"].map((slot) => (
            <Card key={slot} className="rounded-2xl border-border/60">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/3" />
                  <div className="flex gap-2 pt-1">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                </div>
                <Skeleton className="size-8 rounded-md" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
