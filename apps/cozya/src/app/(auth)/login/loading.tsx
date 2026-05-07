import { Card, CardContent, CardHeader } from "@informach/ui/components/card";
import { Skeleton } from "@informach/ui/components/skeleton";

/**
 * Mirrors the centered LoginForm card. Auth layout already provides the
 * decorative background and centering.
 */
export default function LoginLoading() {
  return (
    <Card className="w-full max-w-md border-border/60">
      <CardHeader className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-9 w-full rounded-md" />
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
  );
}
