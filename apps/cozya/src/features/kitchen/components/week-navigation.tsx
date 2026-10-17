import { Button } from "@informach/ui/components/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { addDays, weekRangeLabel, weekStart } from "../dates";

function relativeLabel(week: string) {
  const current = weekStart();
  if (week === current) return "Esta semana";
  if (week === addDays(current, 7)) return "Semana que vem";
  if (week === addDays(current, -7)) return "Semana passada";
  return week < current ? "Semana anterior" : "Mais adiante";
}

export function WeekNavigation({
  week,
  path,
  title,
}: {
  week: string;
  path: "/semana" | "/compras";
  title?: "h1" | "p";
}) {
  const Heading = title ?? "h1";
  return (
    <nav aria-label="Navegar entre semanas" className="flex items-center justify-between gap-3">
      <Button
        asChild
        variant="outline"
        size="icon"
        className="size-11 shrink-0 rounded-xl bg-card print:invisible"
      >
        <Link href={`${path}?week=${addDays(week, -7)}`} aria-label="Semana anterior">
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
      </Button>
      <div className="min-w-0 text-center">
        <Heading className="text-2xl font-extrabold tracking-display md:text-3xl">
          {weekRangeLabel(week)}
        </Heading>
        <p className="text-sm text-muted-foreground">{relativeLabel(week)}</p>
      </div>
      <Button
        asChild
        variant="outline"
        size="icon"
        className="size-11 shrink-0 rounded-xl bg-card print:invisible"
      >
        <Link href={`${path}?week=${addDays(week, 7)}`} aria-label="Próxima semana">
          <ChevronRight className="size-5" aria-hidden />
        </Link>
      </Button>
    </nav>
  );
}
