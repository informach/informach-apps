import { Card, CardContent, CardHeader } from "@informach/ui/components/card";
import { Skeleton } from "@informach/ui/components/skeleton";

/**
 * Mirrors the choose-plan layout: stepper + heading + cycle tabs + 2 plan
 * cards (Free + Pro) side-by-side from md and up.
 */
export default function ChoosePlanLoading() {
  return (
    <div className="w-full max-w-3xl space-y-6">
      <div className="flex items-center justify-center gap-2">
        <Skeleton className="size-2 rounded-full" />
        <Skeleton className="size-2 rounded-full" />
        <Skeleton className="size-2 rounded-full" />
      </div>

      <div className="space-y-2 text-center">
        <Skeleton className="mx-auto h-8 w-64" />
        <Skeleton className="mx-auto h-4 w-80" />
      </div>

      <Skeleton className="mx-auto h-10 w-56 rounded-md" />

      <div className="grid gap-4 md:grid-cols-2">
        {["free", "pro"].map((slot) => (
          <Card key={slot} className="border-border/60">
            <CardHeader className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-9 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {["f1", "f2", "f3", "f4"].map((row) => (
                <div key={row} className="flex items-center gap-2">
                  <Skeleton className="size-4 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
              <Skeleton className="mt-4 h-10 w-full rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
