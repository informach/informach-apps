import { Card, CardContent, CardHeader } from "@informach/ui/components/card";
import { Skeleton } from "@informach/ui/components/skeleton";

/**
 * Mirrors `perfis/page.tsx`: header + grid de cards de perfil (avatar +
 * nome + idade + turma ativa + menu de ações).
 */
export default function PerfisLoading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-80" />
      </header>

      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {["p1", "p2", "p3"].map((slot) => (
          <Card key={slot} className="rounded-2xl border-border/60">
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <Skeleton className="size-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="size-8 rounded-md" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
