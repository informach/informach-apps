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

/**
 * "19 a 25 de outubro" between two arrows. On a phone it is centered and says which week it is;
 * on a computer it sits to the left and, when given, says how the week is going.
 */
export function WeekNavigation({
  week,
  path,
  detail,
}: {
  week: string;
  path: "/semana" | "/compras";
  /** "5 refeições com receita, domingo em aberto", shown on wide screens. */
  detail?: string;
}) {
  const relative = relativeLabel(week);
  return (
    <nav
      aria-label="Navegar entre semanas"
      className="flex items-center justify-between gap-2.5 md:justify-start md:gap-3.5"
    >
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
      <div className="min-w-0 text-center md:text-left">
        <h1 className="text-2xl font-extrabold tracking-display md:text-4xl">
          {weekRangeLabel(week)}
        </h1>
        {detail ? (
          <>
            <p className="text-[13px] text-muted-foreground md:hidden">{relative}</p>
            <p className="hidden text-[15px] text-muted-foreground md:block">{detail}</p>
          </>
        ) : (
          <p className="text-[13px] text-muted-foreground md:text-[15px]">{relative}</p>
        )}
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
