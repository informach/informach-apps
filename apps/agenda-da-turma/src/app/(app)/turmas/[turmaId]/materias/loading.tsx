import { Card, CardContent } from "@informach/ui/components/card";
import { Skeleton } from "@informach/ui/components/skeleton";

/**
 * Mirrors `turmas/[turmaId]/materias/page.tsx`: back link + header da turma +
 * actions row (Nova matéria + Por voz + Por imagem) + grid de subject cards.
 */
export default function MateriasLoading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <div>
        <Skeleton className="mb-2 h-8 w-24" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-4 w-44" />
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-32 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {["s1", "s2", "s3", "s4", "s5", "s6"].map((slot) => (
          <Card key={slot} className="rounded-2xl border-border/60">
            <CardContent className="flex items-center gap-3 p-4">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <Skeleton className="size-8 rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
