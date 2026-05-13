import { Card, CardContent, CardHeader } from "@informach/ui/components/card";
import { Skeleton } from "@informach/ui/components/skeleton";

/**
 * Mirrors `upgrade/page.tsx`: PlanCards centralizado, mensal/anual toggle +
 * card único do plano Pro (sem Free). Sem stepper porque essa rota é Free → Pro.
 */
export default function UpgradeLoading() {
  return (
    <div className="flex w-full justify-center px-4 py-10 md:py-16">
      <div className="w-full max-w-3xl space-y-6">
        <div className="space-y-2 text-center">
          <Skeleton className="mx-auto h-8 w-56" />
          <Skeleton className="mx-auto h-4 w-80" />
        </div>

        <Skeleton className="mx-auto h-10 w-56 rounded-md" />

        <Card className="mx-auto max-w-md border-border/60">
          <CardHeader className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-9 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {["f1", "f2", "f3", "f4", "f5"].map((row) => (
              <div key={row} className="flex items-center gap-2">
                <Skeleton className="size-4 rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
            <Skeleton className="mt-4 h-10 w-full rounded-md" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
