import { Skeleton } from "@informach/ui/components/skeleton";

const DAY_SLOTS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];

/** O mesmo desenho da Semana: título e vista, o período entre as setas e um dia por linha. */
export default function CalendarioLoading() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-28 pt-5 md:px-8 md:pt-8">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-12 w-40 rounded-xl" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="size-11 rounded-xl" />
        <Skeleton className="mx-auto h-5 w-44" />
        <Skeleton className="size-11 rounded-xl" />
      </div>
      <div className="overflow-hidden rounded-[20px] border border-foreground/15">
        {DAY_SLOTS.map((slot) => (
          <div
            key={slot}
            className="grid grid-cols-[62px_1fr] gap-2.5 border-t border-foreground/15 px-4 py-3.5 first:border-t-0"
          >
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </main>
  );
}
