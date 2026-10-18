import { Skeleton } from "@informach/ui/components/skeleton";

/** O mesmo desenho de `UpgradeOffer`: título, a folha do Pro e o "prefere o grátis". */
export default function UpgradeLoading() {
  return (
    <main className="flex w-full justify-center px-4 py-8 md:py-14">
      <div className="w-full max-w-md space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-8 w-4/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="space-y-4 rounded-[20px] border border-foreground/15 p-5">
          <div className="flex gap-2">
            <Skeleton className="h-11 w-24 rounded-full" />
            <Skeleton className="h-11 w-48 rounded-full" />
          </div>
          <Skeleton className="h-10 w-36" />
          {["f1", "f2", "f3", "f4", "f5"].map((row) => (
            <div key={row} className="flex items-center gap-2">
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </main>
  );
}
