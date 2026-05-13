import { Card, CardContent } from "@informach/ui/components/card";
import { Skeleton } from "@informach/ui/components/skeleton";

// Slots estáveis para o grid 7×6 do mês (42 dias visíveis). Strings em vez de
// index satisfaz o Biome noArrayIndexKey.
const MONTH_GRID_SLOTS = Array.from({ length: 42 }, (_, i) => `slot-${i}`);

/**
 * Mirrors `calendario/page.tsx`: header + view-switcher + month grid (6 rows × 7 dias).
 */
export default function CalendarioLoading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-96" />
      </header>

      {/* Top bar: view tabs + navigation + filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-16 rounded-md" />
          <Skeleton className="h-9 w-16 rounded-md" />
          <Skeleton className="h-9 w-12 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="size-9 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
          <Skeleton className="size-9 rounded-md" />
        </div>
        <Skeleton className="h-9 w-44 rounded-md" />
      </div>

      {/* Month grid: 6 weeks × 7 days. Each day cell aspect square */}
      <Card className="border-border/60">
        <CardContent className="p-2 sm:p-4">
          <div className="grid grid-cols-7 gap-px">
            {MONTH_GRID_SLOTS.map((slot) => (
              <Skeleton
                key={slot}
                className="aspect-square w-full min-h-[60px] rounded-md sm:min-h-[80px]"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
