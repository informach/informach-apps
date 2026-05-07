import { Card, CardContent, CardHeader } from "@informach/ui/components/card";
import { Skeleton } from "@informach/ui/components/skeleton";

/**
 * Mirrors the centered SignupForm card with onboarding stepper above it.
 */
export default function SignupLoading() {
  return (
    <div className="w-full max-w-md space-y-4">
      <div className="flex items-center justify-center gap-2">
        <Skeleton className="size-2 rounded-full" />
        <Skeleton className="size-2 rounded-full" />
        <Skeleton className="size-2 rounded-full" />
      </div>

      <Card className="border-border/60">
        <CardHeader className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
          <Skeleton className="h-10 w-full rounded-md" />
          <div className="flex justify-center">
            <Skeleton className="h-3 w-40" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
